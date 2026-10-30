'use client';

/** Takes a photo with the device camera (a laptop webcam or a phone) and hands it back as a file. */
import { useEffect, useRef, useState } from 'react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';

export function CameraCapture({ open, onClose, onCapture }: { open: boolean; onClose: () => void; onCapture: (file: File) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    setProblem(null);
    setReady(false);
    if (!navigator.mediaDevices?.getUserMedia) {
      setProblem('This browser cannot open the camera here. Use "Add file" and choose a photo instead.');
      return undefined;
    }
    navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })
      .then((media) => {
        if (cancelled) { media.getTracks().forEach((track) => track.stop()); return; }
        stream.current = media;
        if (video.current) { video.current.srcObject = media; void video.current.play().then(() => setReady(true)).catch(() => setReady(true)); }
      })
      .catch(() => setProblem('The camera could not be opened. Allow camera access in the browser, or use "Add file" and choose a photo.'));
    return () => {
      cancelled = true;
      stream.current?.getTracks().forEach((track) => track.stop());
      stream.current = null;
    };
  }, [open]);

  function capture() {
    const element = video.current;
    if (!element || !element.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = element.videoWidth;
    canvas.height = element.videoHeight;
    canvas.getContext('2d')?.drawImage(element, 0, 0);
    canvas.toBlob((blob) => {
      if (!blob) return;
      onCapture(new File([blob], `photo-${new Date().toISOString().replace(/[:.]/g, '-')}.jpg`, { type: 'image/jpeg' }));
      onClose();
    }, 'image/jpeg', 0.9);
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Take a photo"
      size="lg"
      footer={<div className="flex justify-end gap-2"><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={capture} disabled={!ready || Boolean(problem)}>Take photo</Button></div>}
    >
      {problem ? (
        <p className="rounded-lg bg-amber-50 p-4 text-sm text-amber-900">{problem}</p>
      ) : (
        <video ref={video} playsInline muted className="max-h-[60vh] w-full rounded-lg bg-black" />
      )}
    </Modal>
  );
}
