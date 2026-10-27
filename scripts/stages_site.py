"""Seed stage: the public pages behind the client's menu (payroll / IR, social security, health & safety, environmental, certification, training,
audit structure). They are ordinary CMS pages, so an administrator edits the wording under CMS > Pages. Safe to re-run: an existing slug is left alone.

The text describes the scope of each area and what the platform does for it. It makes no claims about clients, results or accreditations."""
import uuid

from seed_lib import db, q1, section, sql_text


def ul(items):
    return "<ul>" + "".join(f"<li>{item}</li>" for item in items) + "</ul>"


PAGES = [
    ("payroll-compliance-ir", "Payroll, Compliance and IR Management",
     "Smart Workforce, full and final settlement and the industrial relations matters that sit around them.", 3,
     "<h2>Smart Workforce</h2><p>One record for every employee, from the personal file to the payslip. Employers keep the personal file with its checklist and pre-filled forms (appointment order, confirmation letter, Form F, EPF Form 2 and Form 11, wage acceptance through bank, service record), run payroll with the statutory wage register and a bilingual service card payslip, and let each employee check in, check out and ask for permission from their own profile.</p>"
     "<h2>Full and final settlement</h2><p>Part-month salary, leave encashment, bonus and gratuity on one side, notice and other recoveries on the other, with the net figure in words and an acknowledgement for the employee to sign.</p>"
     "<h2>Industrial relations</h2><p>Advice and documentation on the matters employers most often need to get right:</p>"
     + ul(["Grievance redressal procedure and records", "Standing orders", "Strikes and lockouts: notice and procedure", "Layoff and retrenchment: conditions, notice and compensation", "Provident fund, ESI, bonus and gratuity: calculation and returns"])
     + "<p>Try the <a href=\"/calculators?tool=gratuity\">payroll calculators</a> for EPF, ESI, gratuity, bonus and overtime.</p>"),
    ("social-security-compliance", "Social Security Compliance Management",
     "EPF, ESI, bonus, gratuity and welfare fund: registration, calculation, returns and records.", 4,
     "<h2>What is covered</h2>" + ul(["Provident fund (EPF and pension): registration, contribution and monthly returns", "Employees' State Insurance: coverage, contribution and half-yearly returns", "Payment of Bonus: eligibility, calculation and register", "Payment of Gratuity: eligibility, calculation and nomination (Form F)", "Labour welfare fund and professional tax: due dates and remittance"])
     + "<h2>How we help</h2><p>We check the numbers on your payslips against the statutory rules, keep the registers an inspector asks for, and track every due date on the compliance calendar. Employees' nominations (EPF Form 2, Form F) and declarations (Form 11) are kept in the personal file.</p>"
     + "<p>See the <a href=\"/compliance-calendar-guide\">compliance calendar</a> and the <a href=\"/calculators?tool=epf\">EPF and ESI calculators</a>.</p>"),
    ("health-safety-compliance", "Health and Safety Compliance Management",
     "Safety audits, assessments, risk engineering and the permits that control hazardous work.", 5,
     "<h2>Safety audit</h2><p>Statutory safety audit against IS 14489, the Factories Act and the State Factories Rules, with chapter-wise compliance, non-conformities and a corrective action plan.</p>"
     "<h2>Assessments and risk engineering</h2>" + ul(["HIRA and risk registers (likelihood x consequence)", "HAZOP studies for process hazards", "Fire safety audit, fire load and fire protection calculations", "Lifting calculations and safety performance rates", "Risk assessments for safety, environment, water, waste, energy and chemicals"])
     + "<h2>Work permits</h2><p>Permit-to-work for hot work, work at height, lifting, confined space entry, electrical isolation (lock-out tag-out), cold work and excavation.</p>"
     "<h2>Reports</h2><p>Every audit ends in a report with findings, a corrective and preventive action plan with owners and timelines, and verification by a reviewer before it is approved. Work out injury rates with the <a href=\"/calculators?tool=rates\">safety calculators</a>.</p>"),
    ("environmental-compliance", "Environmental Compliance Management",
     "Environmental audits and assessments, effluent treatment, groundwater, waste, energy and carbon.", 6,
     "<h2>Audits and assessments</h2>" + ul(["Environmental compliance audit against consents and authorisations", "ETP, STP and CETP functionality assessment with a green, yellow or red grade", "TSDF audit and hazardous waste records", "Energy audit and greenhouse gas inventory verification"])
     + "<h2>Groundwater and water</h2><p>The groundwater NOC with its conditions, the water meter log, and the water drawn against the approved quantity, shown as a daily figure and a monthly trend.</p>"
     "<h2>Returns and forms</h2><p>Environmental statement (Form V), hazardous waste returns and the consent renewals due under the Water, Air, Hazardous Waste, E-Waste and Plastic Waste rules, tracked on the compliance calendar.</p>"
     "<h2>Corrective action</h2><p>Non-compliances found in an audit go into a corrective and preventive action report: the Act and Rule, the minimum requirement, the finding with photographs, the root cause, the action plan, the timeline and evidence, verified by a reviewer.</p>"
     "<p>Use the <a href=\"/calculators?tool=emissions\">environmental calculators</a> for emissions, effluent load and water balance.</p>"),
    ("service-global-certification", "Service and Global Certification",
     "Preparation and documentation for textile, social and management-system certification audits.", 8,
     "<h2>Textile standards</h2><p>Document and record readiness for GOTS, GRS, OCS, RCS and RWS audits, including the processing aids, process declarations and reclaimed material declarations they require.</p>"
     "<h2>Social compliance</h2><p>WRAP and Sedex SMETA style audits: site information, policies, records, training and the corrective actions that follow.</p>"
     "<h2>Our role</h2><p>We prepare your records and gaps ahead of the certification body's audit and track the corrective actions afterwards. Certification itself is issued by the standard's own certification body.</p>"),
    ("training-capacity-building", "Training and Capacity Building",
     "Toolbox talks and compliance training for workers, supervisors and management.", 11,
     "<h2>Programmes</h2>" + ul(["Safety and compliance training plans for the year, with attendance records", "Toolbox talks on the hazards of the week", "Worker rights, grievance and anti-harassment awareness", "Fire, evacuation and first-aid drills", "Statutory compliance for HR, payroll and EHS teams"])
     + "<p>Training is planned, delivered and recorded in the same system as your audits, so the evidence an auditor asks for is already on file.</p>"),
    ("audit-structure", "Audit Structure",
     "How an audit moves from assignment to an approved report on the platform.", 7,
     "<h2>The flow</h2><ol><li><strong>Assignment.</strong> An audit is assigned to an auditor of the matching type.</li><li><strong>Fieldwork.</strong> The auditor fills the audit form, records findings and uploads evidence.</li>"
     "<li><strong>Corrective action.</strong> Each non-compliance gets a root cause, an action plan, a timeline and evidence.</li><li><strong>Verification.</strong> A reviewer verifies each finding and approves or returns the report.</li>"
     "<li><strong>Report.</strong> The approved report is printed on the company letterhead and shared with the client.</li></ol>"
     "<h2>Auditor types</h2>" + ul(["Water auditor: water balance, groundwater NOC and meter readings", "Environmental auditor: consents, ETP / STP / CETP, waste", "Energy and GHG auditor: energy audit and carbon inventory", "Safety auditor: IS 14489 safety audit, risk assessment, permits", "Fire safety auditor: fire audit and protection", "Legal and statutory auditor: legal registers and calendars", "Social compliance auditor: WRAP, SMETA, training", "Payroll auditor: payroll and wage register audit", "Textile standards auditor: GOTS, GRS, OCS, RCS, RWS", "Food safety and electrical safety auditors"])),
]


def stage_site():
    section("Public menu pages")
    for slug, title, subtitle, order, html in PAGES:
        if q1(f"SELECT id FROM cms_pages WHERE slug = {sql_text(slug)} AND deleted_at IS NULL"):
            continue
        db("INSERT INTO cms_pages (uuid, slug, title, subtitle, meta_title, meta_description, content_html, page_type, template, sort_order, show_in_menu, menu_label, status, published_at) VALUES "
           f"({sql_text(str(uuid.uuid4()))}, {sql_text(slug)}, {sql_text(title)}, {sql_text(subtitle)}, {sql_text(title)}, {sql_text(subtitle)}, {sql_text(html)}, 'page', 'default', {order}, 1, {sql_text(title)}, 'published', NOW())")
        print(f"  + /{slug}")
    print("  done")
