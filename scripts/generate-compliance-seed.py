"""Generate database/seeds/019_compliance_register.sql.

The compliance register is authored here rather than by hand so every statement
uses the same idempotent shape: `INSERT … SELECT … WHERE NOT EXISTS (natural key)`,
which means re-running `npm run db:seed` never duplicates a row and never clobbers
an edit an administrator has made to the text.
"""
import io

def q(value):
    if value is None:
        return 'NULL'
    if isinstance(value, bool):
        return '1' if value else '0'
    if isinstance(value, int):
        return str(value)
    return "'" + str(value).replace("\\", "\\\\").replace("'", "''") + "'"


# ── acts ─────────────────────────────────────────────────────────────────────
ACTS = [
    dict(
        act_name='Factories Act, 1948', short_name='Factories Act', act_number='63 of 1948', act_year=1948,
        jurisdiction='Central', state_name=None, ministry='Ministry of Labour and Employment',
        department='Directorate General Factory Advice Service & Labour Institutes',
        enactment_date='1948-09-23', effective_date='1949-04-01',
        applicability_criteria=(
            "Applies to every premises where a manufacturing process is carried on with ten or more workers with the aid of power, "
            "or twenty or more workers without the aid of power. Approval of building plans, registration and a licence under the "
            "state Factory Rules are mandatory before the premises is occupied or the process is started."
        ),
        industry_applicability='Manufacturing, processing, packing, repairing, printing, tailoring',
        employee_threshold='10 or more with power · 20 or more without power',
        summary=(
            "The principal law on occupational safety, health and welfare in factories: approval of building plans, licensing and "
            "registration, working hours and holidays, welfare amenities such as drinking water, canteens and creches, safety of "
            "machinery and hazardous processes, the safety committee and safety officer requirements, and the reporting of accidents, "
            "dangerous occurrences and occupational diseases."
        ),
        official_source_url='https://labour.gov.in/acts/factories-act-1948', status='active',
    ),
    dict(
        act_name="Employees' Provident Funds and Miscellaneous Provisions Act, 1952", short_name='EPF Act',
        act_number='19 of 1952', act_year=1952, jurisdiction='Central', state_name=None,
        ministry='Ministry of Labour and Employment', department="Employees' Provident Fund Organisation",
        enactment_date='1952-03-04', effective_date='1952-11-01',
        applicability_criteria=(
            "Applies to every establishment in which twenty or more persons are employed, and to any establishment covered by a "
            "notification irrespective of headcount. Once covered, the establishment remains covered even if employment later falls "
            "below the threshold. International workers are covered from the first day of employment."
        ),
        industry_applicability='All industries other than those exempted by notification (e.g. certain co-operative societies)',
        employee_threshold='20 or more',
        summary=(
            "Provides compulsory provident fund, pension (EPS) and deposit-linked insurance (EDLI). The employer must register the "
            "establishment, enrol every eligible employee within one month of joining, remit monthly contributions by the 15th of the "
            "following month, and file the monthly electronic challan-cum-return (ECR)."
        ),
        official_source_url='https://www.epfindia.gov.in/site_docs/PDFs/Downloads_PDFs/EPFAct1952.pdf', status='active',
    ),
    dict(
        act_name="Employees' State Insurance Act, 1948", short_name='ESI Act', act_number='34 of 1948', act_year=1948,
        jurisdiction='Central', state_name=None, ministry='Ministry of Labour and Employment',
        department='Employees’ State Insurance Corporation', enactment_date='1948-04-19', effective_date='1952-02-24',
        applicability_criteria=(
            "Applies to every factory using power in which ten or more persons are employed, and to every other establishment in which "
            "twenty or more persons are employed, in implemented areas — and to any establishment whose monthly wage bill makes it "
            "liable. Coverage extends to employees drawing wages up to the ceiling notified by the Central Government."
        ),
        industry_applicability='Factories, shops, hotels and restaurants, road transport, cinemas, medical and educational institutions',
        employee_threshold='10 (factory, with power) · 20 (other establishments)',
        summary=(
            "Provides sickness, maternity, disablement and dependants' benefits, medical benefit and funeral expenses to insured persons "
            "and their families. The employer must obtain the 17-digit employer code, register employees within ten days of joining, "
            "pay contributions monthly and file the return of contributions."
        ),
        official_source_url='https://www.esic.gov.in/', status='active',
    ),
    dict(
        act_name='Contract Labour (Regulation and Abolition) Act, 1970', short_name='Contract Labour Act',
        act_number='37 of 1970', act_year=1970, jurisdiction='Central', state_name=None,
        ministry='Ministry of Labour and Employment', department='Office of the Chief Labour Commissioner (Central)',
        enactment_date='1970-09-05', effective_date='1971-02-10',
        applicability_criteria=(
            "Applies to every establishment in which twenty or more workmen are employed or were employed on any day of the preceding "
            "twelve months as contract labour, and to every contractor who employs or employed twenty or more workmen. A state "
            "notification may extend it below the threshold for particular works."
        ),
        industry_applicability='Manufacturing, construction, mines, plantations, and establishments using contract labour',
        employee_threshold='20 or more contract workmen',
        summary=(
            "Regulates the employment of contract labour. The principal employer must register the establishment, engage only licensed "
            "contractors, maintain registers of workmen and wages, provide canteen, rest rooms, drinking water and first-aid facilities, "
            "and pay wages where the contractor fails to. The Act also empowers prohibition of contract labour in specified processes."
        ),
        official_source_url='https://labour.gov.in/acts/contract-labour-regulation-and-abolition-act-1970', status='active',
    ),
    dict(
        act_name='Payment of Gratuity Act, 1972', short_name='Gratuity Act', act_number='39 of 1972', act_year=1972,
        jurisdiction='Central', state_name=None, ministry='Ministry of Labour and Employment',
        department='Office of the Labour Commissioner', enactment_date='1972-08-21', effective_date='1972-09-16',
        applicability_criteria=(
            "Applies to every factory, mine, oilfield, plantation, port, railway company, shop or other establishment in which ten or "
            "more persons are employed or were employed on any day of the preceding twelve months. Coverage continues even if the number "
            "of employees falls below ten."
        ),
        industry_applicability='All establishments with ten or more employees', employee_threshold='10 or more',
        summary=(
            "Gratuity is payable on resignation, retirement, superannuation, disablement or death after five years of continuous service: "
            "fifteen days' wages for each completed year of service, computed on the last drawn basic pay plus dearness allowance, subject "
            "to the ceiling notified by the Central Government. It must be determined and paid within thirty days of falling due, and the "
            "employer must display the abstract of the Act."
        ),
        official_source_url='https://labour.gov.in/acts/payment-gratuity-act-1972', status='active',
    ),
    dict(
        act_name='Maternity Benefit Act, 1961', short_name='Maternity Benefit Act', act_number='53 of 1961', act_year=1961,
        jurisdiction='Central', state_name=None, ministry='Ministry of Labour and Employment',
        department='Office of the Labour Commissioner', enactment_date='1961-12-12', effective_date='1961-12-12',
        applicability_criteria=(
            "Applies to every establishment covered by the Factories Act, Mines Act and Plantations Labour Act and, after the 2017 "
            "amendment, to every establishment with ten or more employees, including shops and establishments."
        ),
        industry_applicability='All establishments with ten or more employees', employee_threshold='10 or more',
        summary=(
            "Provides twenty-six weeks' paid maternity leave for the first two children and twelve weeks for the third onwards, prenatal "
            "and postnatal care, medical bonus, nursing breaks, and — for establishments with fifty or more employees — a crèche facility. "
            "The 2017 amendment also introduced work-from-home where the nature of work permits."
        ),
        official_source_url='https://labour.gov.in/acts/maternity-benefit-act-1961', status='active',
    ),
    dict(
        act_name='Tamil Nadu Shops and Establishments Act, 1947', short_name='TN Shops & Establishments',
        act_number='36 of 1947', act_year=1947, jurisdiction='State', state_name='Tamil Nadu',
        ministry='Labour and Employment Department, Government of Tamil Nadu', department='Commissioner of Labour',
        enactment_date='1947-12-31', effective_date='1948-01-01',
        applicability_criteria=(
            "Applies to every shop, commercial establishment, hotel, restaurant, theatre and place of public amusement in Tamil Nadu "
            "irrespective of headcount, with limited exemptions for establishments run by the owner's family and for categories notified "
            "by the Government."
        ),
        industry_applicability='Shops, offices, commercial establishments, hotels and restaurants in Tamil Nadu',
        employee_threshold='All sizes (state act)',
        summary=(
            "Regulates opening and closing hours, daily and weekly working hours, rest intervals, overtime wages, leave with wages and "
            "the registration of the establishment within thirty days of commencement. The registration certificate must be displayed at "
            "the premises and the registers of employment and wages preserved for three years."
        ),
        official_source_url='https://labour.tn.gov.in/', status='active',
    ),
    dict(
        act_name="Employees' Compensation Act, 1923", short_name='EC Act', act_number='8 of 1923', act_year=1923,
        jurisdiction='Central', state_name=None, ministry='Ministry of Labour and Employment',
        department='Office of the Labour Commissioner', enactment_date='1923-03-05', effective_date='1923-07-01',
        applicability_criteria=(
            "Applies to every employer of persons employed in construction, railways, factories, mines, plantations and the other "
            "employments listed in the Schedules. Where the ESI Act applies to an employee, compensation under this Act is not payable "
            "for the same injury."
        ),
        industry_applicability='Construction, transport, mines, factories and other listed employments',
        employee_threshold='All employers in listed employments',
        summary=(
            "Requires the employer to pay compensation for injury by accident arising out of and in the course of employment — temporary "
            "or permanent disablement, or death — calculated on the wage slab notified by the Central Government, and to report fatal "
            "accidents within seven days."
        ),
        official_source_url='https://labour.gov.in/acts/employees-compensation-act-1923', status='active',
    ),
    dict(
        act_name='Industrial Disputes Act, 1947', short_name='ID Act', act_number='14 of 1947', act_year=1947,
        jurisdiction='Central', state_name=None, ministry='Ministry of Labour and Employment',
        department='Office of the Labour Commissioner', enactment_date='1947-03-11', effective_date='1947-04-01',
        applicability_criteria=(
            "Applies to all industrial establishments with one or more workmen. The special provisions on lay-off, retrenchment and "
            "closure (sections 25K, 25M, 25N and 25-O) apply to establishments employing one hundred or more workmen on an average "
            "per working day in the preceding twelve months."
        ),
        industry_applicability='All industrial establishments', employee_threshold='All · special provisions at 100 or more',
        summary=(
            "Governs lay-off, retrenchment, closure and transfer of undertakings, defines unfair labour practices, and sets out the "
            "machinery for settling industrial disputes through works committees, conciliation, labour courts and industrial tribunals. "
            "A Grievance Redressal Committee is mandatory at establishments with twenty or more workmen."
        ),
        official_source_url='https://labour.gov.in/acts/industrial-disputes-act-1947', status='active',
    ),
]

# ── rules (obligations) ──────────────────────────────────────────────────────
RULES = [
    # Factories Act
    dict(act='Factories Act, 1948', rule_number='F-01', rule_title='Factory licence and registration renewal',
         compliance_type='Mandatory', frequency='Annual', due_day_of_month=None, responsible_role='Plant Head / Factory Manager',
         rule_text="The occupier must hold a valid licence and registration certificate for the factory and renew it before the period stated on the licence lapses; the licence must be displayed at the premises.",
         penalty_details='Under section 92 of the Act — imprisonment up to two years or fine up to ₹1,00,000, or both, with a further fine for continuing offence.',
         evidence_required='Factory licence, registration certificate, renewal receipt / challan.', status='active'),
    dict(act='Factories Act, 1948', rule_number='F-02', rule_title='Safety committee and safety officer',
         compliance_type='Mandatory', frequency='Monthly', due_day_of_month=5, responsible_role='Safety Officer',
         rule_text="Factories employing 1,000 or more workers must constitute a safety committee and appoint a qualified safety officer; the committee must meet at least once a quarter and record its minutes.",
         penalty_details='Section 92 — fine and, in hazardous process factories, imprisonment on repeated contravention.',
         evidence_required='Safety committee constitution order, appointment letter of the safety officer, quarterly meeting minutes.', status='active'),
    dict(act='Factories Act, 1948', rule_number='F-03', rule_title='Testing of lifting machines, chains and ropes',
         compliance_type='Mandatory', frequency='Annual', due_day_of_month=15, responsible_role='Maintenance Engineer',
         rule_text="Every lifting machine, chain, rope and lifting tackle must be thoroughly examined by a competent person at least once in twelve months, and the register of examinations maintained.",
         penalty_details='Section 92 — general penalty for offences.',
         evidence_required='Competent person certificate (Form 8 register), examination report, register of lifting machines.', status='active'),
    dict(act='Factories Act, 1948', rule_number='F-04', rule_title='Reporting of accidents and dangerous occurrences',
         compliance_type='Mandatory', frequency='Event-based', due_day_of_month=None, responsible_role='Safety Officer',
         rule_text="Notice of any accident causing death or bodily injury resulting in absence from work for more than 48 hours, and of any dangerous occurrence, must be sent to the prescribed authority within the time limits in the state rules.",
         penalty_details='Section 92 read with the state Factory Rules — fine and imprisonment for failure to report a notifiable accident.',
         evidence_required='Notice of accident (Form 18 / state equivalent), acknowledgement from the Inspector of Factories, investigation report.', status='active'),
    dict(act='Factories Act, 1948', rule_number='F-05', rule_title='Pre-employment and periodic medical examination of workers in hazardous processes',
         compliance_type='Mandatory', frequency='Annual', due_day_of_month=None, responsible_role='Occupational Health Centre',
         rule_text="Workers employed in hazardous processes must be medically examined before employment and periodically thereafter, with the health records preserved for the prescribed period and the worker informed of the findings.",
         penalty_details='Section 92 — general penalty; section 96A — additional liability of the occupier.',
         evidence_required="Occupational health centre records, medical examination schedule, worker health cards.", status='active'),
    # EPF
    dict(act="Employees' Provident Funds and Miscellaneous Provisions Act, 1952", rule_number='EPF-01',
         rule_title='Monthly provident fund contributions and ECR filing', compliance_type='Mandatory', frequency='Monthly',
         due_day_of_month=15, responsible_role='Payroll Manager',
         rule_text="Employer and employee contributions for each month must be deposited with the EPFO by the 15th of the following month, with the electronic challan-cum-return (ECR) filed for the same month.",
         penalty_details='Section 14B — damages up to the amount of arrears; section 7Q — 12% interest per annum on delayed deposit; prosecution under section 14.',
         evidence_required='Monthly challan, ECR acknowledgement, bank remittance proof.', status='active'),
    dict(act="Employees' Provident Funds and Miscellaneous Provisions Act, 1952", rule_number='EPF-02',
         rule_title='Employee enrolment and UAN linkage', compliance_type='Mandatory', frequency='Event-based', due_day_of_month=None,
         responsible_role='HR Manager',
         rule_text="Every eligible employee must be enrolled and their Aadhaar linked to the Universal Account Number within one month of joining; KYC and nomination details must be updated on the EPFO portal.",
         penalty_details='Section 14 — prosecution for failure to comply with the scheme.',
         evidence_required='UAN allotment proof, KYC/Nomination printout, employee enrolment register.', status='active'),
    dict(act="Employees' Provident Funds and Miscellaneous Provisions Act, 1952", rule_number='EPF-03',
         rule_title='Annual PF account reconciliation and UAN informatics check', compliance_type='Recommended', frequency='Annual',
         due_day_of_month=None, responsible_role='Payroll Manager',
         rule_text="Reconcile the payroll deductions, the ECR filed and the EPFO passbook balances for the financial year, and resolve discrepancies before the accounts are closed.",
         penalty_details='—',
         evidence_required='Reconciliation statement, passbook downloads, discrepancy resolution notes.', status='active'),
    # ESI
    dict(act="Employees' State Insurance Act, 1948", rule_number='ESI-01', rule_title='Monthly ESI contribution and return of contributions',
         compliance_type='Mandatory', frequency='Monthly', due_day_of_month=15, responsible_role='Payroll Manager',
         rule_text="Contributions for the contribution period must be paid within 15 days of the last day of the month of payment of wages, and the return of contributions filed for the period.",
         penalty_details="Regulation 31 of the ESI (General) Regulations — damages; section 85 — prosecution with imprisonment up to two years for failure to pay contributions.",
         evidence_required='Payment challan, return of contributions acknowledgement, bank receipt.', status='active'),
    dict(act="Employees' State Insurance Act, 1948", rule_number='ESI-02', rule_title='Employee registration, TIC and dependants’ records',
         compliance_type='Mandatory', frequency='Event-based', due_day_of_month=None, responsible_role='HR Manager',
         rule_text="Employees must be registered within ten days of joining, temporary identification certificates issued until the insurance number is allotted, and the family particulars of each insured person kept up to date.",
         penalty_details='Section 85 — prosecution; employer liable for benefit paid during the period of default.',
         evidence_required='Employer code certificate, employee registration list, dependants register.', status='active'),
    # Contract Labour
    dict(act='Contract Labour (Regulation and Abolition) Act, 1970', rule_number='CL-01', rule_title='Principal employer registration certificate',
         compliance_type='Mandatory', frequency='One-time', due_day_of_month=None, responsible_role='HR Manager',
         rule_text="The principal employer must apply to the registering officer for a certificate of registration before engaging contract labour in the establishment and pay the prescribed fee.",
         penalty_details='Section 24 — imprisonment up to three months or fine up to ₹1,000, or both, with a continuing fine for subsisting failure.',
         evidence_required='Certificate of registration, application (Form I), fee challan, list of contractor details.', status='active'),
    dict(act='Contract Labour (Regulation and Abolition) Act, 1970', rule_number='CL-02', rule_title='Contractor licence verification',
         compliance_type='Mandatory', frequency='Event-based', due_day_of_month=None, responsible_role='Contract Cell',
         rule_text="No contractor may be engaged without a valid licence; the principal employer must verify the licence, keep a copy on file and ensure the licence remains in force for the duration of the work.",
         penalty_details='Section 23 — imprisonment up to three months or fine up to ₹1,000, or both, for employing contract labour without a licence.',
         evidence_required='Contractor licence copy, licence validity register, contractor-wise work order.', status='active'),
    dict(act='Contract Labour (Regulation and Abolition) Act, 1970', rule_number='CL-03', rule_title='Register of contract workmen and wage payments',
         compliance_type='Mandatory', frequency='Monthly', due_day_of_month=7, responsible_role='Contract Cell',
         rule_text="Maintain the register of workmen employed by each contractor, the muster roll, the register of wages and deductions, and the wage slips; wages must be paid in the presence of the authorised representative of the principal employer.",
         penalty_details='Section 23 read with Rule 78 of the Central Rules — fine.',
         evidence_required='Register of workmen, muster roll, wage registers, bank statements, wage slip acknowledgements.', status='active'),
    # Gratuity
    dict(act='Payment of Gratuity Act, 1972', rule_number='GR-01', rule_title='Gratuity payment within thirty days of it falling due',
         compliance_type='Mandatory', frequency='Event-based', due_day_of_month=None, responsible_role='Payroll Manager',
         rule_text="Determine and pay gratuity within thirty days from the date it becomes payable, whether or not the employee applies for it; if not paid in time, pay simple interest at the notified rate.",
         penalty_details='Section 9 — imprisonment up to two years, or fine up to ₹2,00,000, or both, for non-payment; section 8 — recovery as arrears of land revenue.',
         evidence_required='TDS-free gratuity calculation sheet, payment advice, bank proof, employee acknowledgement.', status='active'),
    dict(act='Payment of Gratuity Act, 1972', rule_number='GR-02', rule_title='Nomination and display of the abstract',
         compliance_type='Mandatory', frequency='One-time', due_day_of_month=None, responsible_role='HR Manager',
         rule_text="Obtain a nomination from each employee and display the abstract of the Act and the rules at a conspicuous place in the establishment, in English and the language understood by the majority of employees.",
         penalty_details='—',
         evidence_required='Signed nominations, photograph of the displayed abstract.', status='active'),
    # Maternity Benefit
    dict(act='Maternity Benefit Act, 1961', rule_number='MB-01', rule_title='Maternity leave, bonus and nursing breaks',
         compliance_type='Mandatory', frequency='Event-based', due_day_of_month=None, responsible_role='HR Manager',
         rule_text="Grant twenty-six weeks' paid leave for the first two children and twelve weeks for subsequent children, pay the medical bonus, provide nursing breaks until the child is fifteen months old, and allow the leave to start up to eight weeks before the expected date of delivery.",
         penalty_details='Section 21 — imprisonment up to one year, or fine up to ₹5,000, or both.',
         evidence_required='Application for maternity benefit, medical certificate, wage payment records for the leave period.', status='active'),
    dict(act='Maternity Benefit Act, 1961', rule_number='MB-02', rule_title='Crèche facility and notice',
         compliance_type='Mandatory', frequency='Monthly', due_day_of_month=1, responsible_role='HR Manager',
         rule_text="Establishments with fifty or more employees must provide a crèche facility, allow the woman four visits a day to it, and inform every woman at the time of appointment and thereafter of the maternity benefits available.",
         penalty_details="Section 21 — fine; Rule 5(3) of the Maternity Benefit (Mines and Circus) Rules for the intimation requirement.",
         evidence_required='Crèche facility details, appointment intimation, record of crèche visits.', status='active'),
    # TN Shops & Establishments
    dict(act='Tamil Nadu Shops and Establishments Act, 1947', rule_number='TNSE-01', rule_title='Registration of the establishment and display of the certificate',
         compliance_type='Mandatory', frequency='One-time', due_day_of_month=None, responsible_role='Establishment Head',
         rule_text="Register the establishment in Form A within thirty days of commencement of business with the Inspector of the area, renew the registration as prescribed and display the certificate of registration at the premises.",
         penalty_details='Section 38 — fine not less than ₹500 but up to ₹5,000 for a first offence, and imprisonment on repeat contraventions.',
         evidence_required='Form A application, certificate of registration, fee receipt, photograph of the displayed certificate.', status='active'),
    dict(act='Tamil Nadu Shops and Establishments Act, 1947', rule_number='TNSE-02', rule_title='Registers of employment, wages and leave',
         compliance_type='Mandatory', frequency='Monthly', due_day_of_month=10, responsible_role='HR Manager',
         rule_text="Maintain the register of employment (Form L / register of sales), the wage register, the leave register and the register of attendance in the prescribed form and preserve them for three years.",
         penalty_details='Section 17 read with section 38 — fine.',
         evidence_required='Register of employment, wage register, leave register, attendance records.', status='active'),
    dict(act='Tamil Nadu Shops and Establishments Act, 1947', rule_number='TNSE-03', rule_title='Weekly holiday and daily working-hour compliance',
         compliance_type='Mandatory', frequency='Weekly', due_day_of_month=None, responsible_role='Establishment Head',
         rule_text="Allow one whole day for rest in every week, keep daily working hours in the ordinary course within nine hours and forty-eight hours in a week, provide the prescribed interval after five hours of continuous work and pay overtime at twice the ordinary rate.",
         penalty_details='Section 38 — fine per contravention.',
         evidence_required='Attendance register, overtime register, wage register showing overtime paid.', status='active'),
    # Employees' Compensation
    dict(act="Employees' Compensation Act, 1923", rule_number='EC-01', rule_title='Reporting a fatal accident within seven days',
         compliance_type='Mandatory', frequency='Event-based', due_day_of_month=None, responsible_role='Safety Officer',
         rule_text="Send notice of any accident causing death or serious bodily injury to the Commissioner for Employees' Compensation within seven days of its occurrence, and prefer a claim on behalf of the dependants.",
         penalty_details='Section 18A — penalty on the employer for failure to submit the required report.',
         evidence_required='Notice of accident to the Commissioner, accident register, post-mortem / medical report, claim papers.', status='active'),
    # ID Act
    dict(act='Industrial Disputes Act, 1947', rule_number='ID-01', rule_title='Grievance Redressal Committee at establishments with 20 or more workmen',
         compliance_type='Mandatory', frequency='One-time', due_day_of_month=None, responsible_role='HR Manager',
         rule_text="Constitute a Grievance Redressal Committee with the prescribed composition for establishments with twenty or more workmen, and complete the decision-making process within forty-five days of receiving a grievance.",
         penalty_details='Section 25U — fine for contravention of the provisions relating to lay-off, retrenchment and closure read with the Grievance Redressal machinery.',
         evidence_required='Committee constitution order, grievance register, minutes of the committee meetings.', status='active'),
]

# ── regulations (instruments) ────────────────────────────────────────────────
REGULATIONS = [
    dict(act='Factories Act, 1948', rule='F-01', regulation_name='Tamil Nadu Factory Rules, 1950',
         regulation_number='G.O. Ms. No. 2229', issuing_authority='Government of Tamil Nadu, Labour Department',
         issue_date='1950-06-01', effective_date='1950-06-01',
         scope='Applies to every factory in Tamil Nadu registered under the Factories Act, 1948, and to the occupier, manager and workers of those factories.',
         obligations="Prescribes the form of application for registration and licence (Form 1 and 2), the layout approval process, safety and welfare provisions specific to the state, the registers and forms to be maintained, and the fees payable for licence and renewal.",
         reporting_authority='Inspector of Factories, Tamil Nadu', reporting_frequency='Annual licence renewal',
         penalty_provision='Rule 118 read with section 92 of the Act for contravention of the rules.', status='active'),
    dict(act="Employees' Provident Funds and Miscellaneous Provisions Act, 1952", rule='EPF-01',
         regulation_name="Employees' Provident Funds Scheme, 1952", regulation_number='G.S.R. 1509',
         issuing_authority="Employees' Provident Fund Organisation", issue_date='1952-09-02', effective_date='1952-11-01',
         scope='Applies to every establishment covered by the Act and to every employee eligible for membership of the Fund.',
         obligations="Sets out the rate of contributions (12% of basic wages and dearness allowance by employee and employer, with 8.33% of the employer share diverted to the Pension Fund), the maintenance of the provident fund account, withdrawal and advance conditions, and the monthly ECR compliance process.",
         reporting_authority='Regional Provident Fund Commissioner', reporting_frequency='Monthly by the 15th',
         penalty_provision='Section 14B for damages on delayed remittance, section 7Q for interest, and section 14 for prosecution.', status='active'),
    dict(act="Employees' State Insurance Act, 1948", rule='ESI-01',
         regulation_name="Employees' State Insurance (General) Regulations, 1950", regulation_number='G.S.R. 96',
         issuing_authority="Employees' State Insurance Corporation", issue_date='1950-06-17', effective_date='1952-02-24',
         scope='Applies to every covered establishment, insured person and employer within implemented areas.',
         obligations="Prescribes the employer code application, registration of employees and issue of the temporary identification certificate, the contribution period and benefit period, payment of contributions within 15 days, maintenance of the register of employees, and the return of contributions.",
         reporting_authority='Regional Office, ESI Corporation', reporting_frequency='Monthly with the return of contributions',
         penalty_provision='Regulation 31 for damages on delayed payment and section 85 of the Act for prosecution.', status='active'),
    dict(act='Contract Labour (Regulation and Abolition) Act, 1970', rule='CL-03',
         regulation_name='Contract Labour (Regulation and Abolition) Central Rules, 1971', regulation_number='G.S.R. 191',
         issuing_authority='Ministry of Labour and Employment', issue_date='1971-02-10', effective_date='1971-02-10',
         scope='Applies to every principal employer and contractor covered by the Act across central sphere establishments, and to the records they must maintain.',
         obligations="Prescribes the registers of contractors, workmen, wages and deductions, overtime, and the forms for the certificate of registration and licence, together with the welfare amenities — canteen, rest room, drinking water, latrines and first aid — that must be provided where the prescribed number of contract workmen is engaged.",
         reporting_authority='Office of the Chief Labour Commissioner (Central)', reporting_frequency='On demand / annual return',
         penalty_provision='Rule 78 read with sections 23 and 24 of the Act.', status='active'),
    dict(act="Employees' State Insurance Act, 1948", rule='ESI-02',
         regulation_name="Employees' State Insurance (Central) Amendment Rules, 2016 — wage ceiling raised",
         regulation_number='G.S.R. 1211(E)', issuing_authority='Ministry of Labour and Employment',
         issue_date='2016-12-28', effective_date='2017-01-01',
         scope='Applies to all covered establishments; it raised the wage limit for coverage of employees from ₹15,000 to ₹21,000 per month.',
         obligations="Employers must add employees drawing wages up to the revised ceiling to the ESI rolls, and continue the coverage of employees already registered whose wages remain within the ceiling.",
         reporting_authority='Regional Office, ESI Corporation', reporting_frequency='Monthly with the return of contributions',
         penalty_provision='Section 85 of the Act where contributions are not paid on the enlarged coverage.', status='active'),
    dict(act="Employees' Provident Funds and Miscellaneous Provisions Act, 1952", rule=None,
         regulation_name='Employees’ Pension Scheme, 1995', regulation_number='G.S.R. 390(E)',
         issuing_authority="Employees' Provident Fund Organisation", issue_date='1995-11-16', effective_date='1995-11-16',
         scope='Applies to every member of the Employees’ Provident Fund who is entitled to pension under the scheme.',
         obligations="Provides for pension on superannuation, retirement, permanent total disablement, widow/widower pension, children pension and orphan pension, and prescribes the minimum ten years' eligible service for pension and the computation of pensionable salary.",
         reporting_authority='Regional Provident Fund Commissioner', reporting_frequency='Monthly through the ECR',
         penalty_provision='Section 14B and 7Q of the Act for short or delayed remittance of the pension fund share.', status='active'),
]

# ── gazette notifications ────────────────────────────────────────────────────
NOTIFICATIONS = [
    dict(notification_number='G.S.R. 1211(E)', act="Employees' State Insurance Act, 1948",
         title='ESI wage ceiling for coverage raised from ₹15,000 to ₹21,000 per month',
         notification_date='2016-12-28', issuing_authority='Ministry of Labour and Employment',
         gazette_reference='The Gazette of India, Extraordinary, Part II, Section 3(i)',
         subject='Amendment to Rule 50 of the Employees’ State Insurance (Central) Rules, 1950 revising the wage limit for coverage of employees.',
         body="The Central Government raised the wage limit for coverage of an employee under the ESI Act from ₹15,000 to ₹21,000 per month with effect from 1 January 2017. Establishments must enrol employees whose wages fall within the revised ceiling and continue to cover those already registered.",
         effective_date='2017-01-01',
         applicability='Every establishment covered by the ESI Act and every employee whose wages do not exceed the revised ceiling.',
         action_required='Update the employee master, add newly covered employees to the ESI rolls and recalculate the monthly contribution before filing the next return.',
         status='active'),
    dict(notification_number='G.S.R. 609(E)', act="Employees' Provident Funds and Miscellaneous Provisions Act, 1952",
         title='EPF wage ceiling for compulsory coverage raised from ₹6,500 to ₹15,000 per month',
         notification_date='2014-08-22', issuing_authority='Ministry of Labour and Employment',
         gazette_reference='The Gazette of India, Extraordinary, Part II, Section 3(i)',
         subject='Amendment to paragraph 2 of the Employees’ Provident Funds Scheme, 1952 raising the wage ceiling for coverage.',
         body="The wage ceiling for compulsory coverage under the Employees’ Provident Funds Scheme was revised to ₹15,000 per month. Employees drawing wages above the ceiling at the time of joining may become members by joint option of employer and employee; those already covered remain members.",
         effective_date='2014-09-01',
         applicability="Every establishment covered by the EPF Act and employees drawing wages up to ₹15,000 per month.",
         action_required='Review the employee master for newly covered members, obtain nominations and enrol them with the EPFO.',
         status='active'),
    dict(notification_number='Act No. 6 of 2017', act='Maternity Benefit Act, 1961',
         title='Maternity Benefit (Amendment) Act, 2017 — 26 weeks’ paid leave and crèche facility',
         notification_date='2017-03-27', issuing_authority='Ministry of Law and Justice (Legislative Department)',
         gazette_reference='The Gazette of India, Extraordinary, Part II, Section 1',
         subject='Amendment to sections 5, 11A and 12 of the Maternity Benefit Act, 1961.',
         body="Paid maternity leave for the first two children was extended to twenty-six weeks (with not more than eight weeks before the expected date of delivery), leave for the third child onwards remains twelve weeks, an establishment with fifty or more employees must provide a crèche, and an employer may permit work from home where the nature of work permits.",
         effective_date='2017-04-01',
         applicability='Every establishment covered by the Maternity Benefit Act, 1961.',
         action_required='Revise the leave policy, set up or contract a crèche facility where fifty or more employees are employed, and inform every woman employee of the enhanced benefits at the time of appointment.',
         status='active'),
    dict(notification_number='G.O. Ms. No. 76', act='Tamil Nadu Shops and Establishments Act, 1947',
         title='Tamil Nadu — extension of the TNSE registration portal and e-renewal requirement',
         notification_date='2020-06-15', issuing_authority='Labour and Employment Department, Government of Tamil Nadu',
         gazette_reference='Tamil Nadu Government Gazette, Part II, Section 2',
         subject='Directions for online registration and renewal of establishments under the Tamil Nadu Shops and Establishments Act, 1947.',
         body="Establishments in Tamil Nadu must register online through the Labour Department portal, obtain the e-registration certificate and renew through the same portal. The certificate must be displayed at the premises.",
         effective_date='2020-07-01',
         applicability='Every shop, commercial establishment, hotel and restaurant in Tamil Nadu.',
         action_required='Migrate any paper registration to the portal, print and display the e-certificate and note the renewal date for tracking.',
         status='active'),
]

COLUMNS = dict(
    acts=['act_name', 'short_name', 'act_number', 'act_year', 'jurisdiction', 'state_name', 'ministry', 'department',
          'enactment_date', 'effective_date', 'applicability_criteria', 'industry_applicability', 'employee_threshold',
          'summary', 'official_source_url', 'status'],
    rules=['act_id', 'rule_number', 'rule_title', 'rule_text', 'compliance_type', 'frequency', 'due_day_of_month',
           'responsible_role', 'penalty_details', 'evidence_required', 'status'],
    regulations=['act_id', 'rule_id', 'regulation_name', 'regulation_number', 'issuing_authority', 'issue_date',
                 'effective_date', 'scope', 'obligations', 'reporting_authority', 'reporting_frequency',
                 'penalty_provision', 'status'],
    notifications=['notification_number', 'title', 'notification_date', 'issuing_authority', 'act_id', 'gazette_reference',
                   'subject', 'body', 'effective_date', 'applicability', 'action_required', 'status'],
)

lines = ["""-- ============================================================================
-- 019 — Compliance register: legislation, obligations, instruments and gazette
-- notifications. Generated by scripts/generate-compliance-seed.py.
--
-- Real Indian labour legislation with the applicability thresholds our audits
-- use. Idempotent by design: every statement is guarded with
-- `WHERE NOT EXISTS (natural key)`, so re-running `npm run db:seed` never
-- duplicates a register entry and never overwrites an administrator's edit.
-- ============================================================================
"""]

# acts
lines.append('-- ─────────────────────────────── acts ───────────────────────────────')
for act in ACTS:
    values = ", ".join(q(act[col]) for col in COLUMNS['acts'])
    lines.append(
        "INSERT INTO compliance_acts (%s)\n  SELECT %s WHERE NOT EXISTS (SELECT 1 FROM compliance_acts WHERE act_name = %s);"
        % (', '.join(COLUMNS['acts']), values, q(act['act_name']))
    )

# rules — act_id resolved by sub-select, guard on (act_id, rule_title)
lines.append('\n-- ───────────────────────── obligations (rules) ──────────────────────')
for rule in RULES:
    act_sub = f"(SELECT id FROM compliance_acts WHERE act_name = {q(rule['act'])} LIMIT 1)"
    values = ", ".join([
        act_sub,
        q(rule['rule_number']), q(rule['rule_title']), q(rule['rule_text']), q(rule['compliance_type']),
        q(rule['frequency']), q(rule['due_day_of_month']), q(rule['responsible_role']),
        q(rule['penalty_details']), q(rule['evidence_required']), q(rule['status']),
    ])
    lines.append(
        "INSERT INTO compliance_rules (%s)\n  SELECT %s WHERE NOT EXISTS (SELECT 1 FROM compliance_rules WHERE act_id = %s AND rule_title = %s);"
        % (', '.join(COLUMNS['rules']), values, act_sub, q(rule['rule_title']))
    )

# regulations
lines.append('\n-- ────────────────────────── instruments (regulations) ───────────────')
for reg in REGULATIONS:
    act_sub = f"(SELECT id FROM compliance_acts WHERE act_name = {q(reg['act'])} LIMIT 1)"
    rule_sub = 'NULL'
    if reg.get('rule'):
        rule_sub = (f"(SELECT id FROM compliance_rules WHERE rule_number = {q(reg['rule'])} "
                    f"AND act_id = {act_sub} LIMIT 1)")
    values = ", ".join([
        act_sub, rule_sub, q(reg['regulation_name']), q(reg['regulation_number']), q(reg['issuing_authority']),
        q(reg['issue_date']), q(reg['effective_date']), q(reg['scope']), q(reg['obligations']),
        q(reg['reporting_authority']), q(reg['reporting_frequency']), q(reg['penalty_provision']), q(reg['status']),
    ])
    lines.append(
        "INSERT INTO compliance_regulations (%s)\n  SELECT %s WHERE NOT EXISTS (SELECT 1 FROM compliance_regulations WHERE regulation_name = %s);"
        % (', '.join(COLUMNS['regulations']), values, q(reg['regulation_name']))
    )

# notifications
lines.append('\n-- ───────────────────────── gazette notifications ────────────────────')
for note in NOTIFICATIONS:
    act_sub = f"(SELECT id FROM compliance_acts WHERE act_name = {q(note['act'])} LIMIT 1)"
    values = ", ".join([
        q(note['notification_number']), q(note['title']), q(note['notification_date']), q(note['issuing_authority']),
        act_sub, q(note['gazette_reference']), q(note['subject']), q(note['body']), q(note['effective_date']),
        q(note['applicability']), q(note['action_required']), q(note['status']),
    ])
    lines.append(
        "INSERT INTO compliance_notifications (%s)\n  SELECT %s WHERE NOT EXISTS (SELECT 1 FROM compliance_notifications WHERE notification_number = %s);"
        % (', '.join(COLUMNS['notifications']), values, q(note['notification_number']))
    )

io.open('database/seeds/019_compliance_register.sql', 'w', encoding='utf-8').write('\n\n'.join(lines) + '\n')
print(f"wrote 019_compliance_register.sql — {len(ACTS)} acts, {len(RULES)} rules, {len(REGULATIONS)} regulations, {len(NOTIFICATIONS)} notifications")
