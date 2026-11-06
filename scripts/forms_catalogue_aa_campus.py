"""Audit and Assessment forms built from the client's sample files (2026-11-05), part 2: the two environmental audit reports.

    Uploads_GalleryFolders_130_6.3.4_58068.pdf  (Environmental Audit Report of a degree college: land use, water, energy, waste, plantation,
                                                 carbon footprint questionnaires, air quality, noise, recommendations)
                                                -> Environmental Audit Report (Green Audit)
    ENVIRONMENT-AUDIT-REPORT-2023.pdf           (Environment Audit Report 2023 of a college: CO2 from transport and electricity,
                                                 water and waste GHG, best practices, species list, carbon-neutral strategy)
                                                -> Environment Audit Report - Carbon Footprint

Every question and table of the samples is a field or table of the form; nothing is pre-filled with the sample college's answers.
"""
from forms_dsl import (
    area, col, coldate, colformula, colnum, colsel, date, form, formula, header, multi, note, num, picture, reset_keys, rich, sec, select, signoff, table, table_sec,
    text, upload, yesno,
)

PRIORITY = ["Critical", "High", "Medium", "Low"]
STATUS = ["Open", "In progress", "Closed", "Verified"]


def qa(prefix, items):
    """The questionnaire the sample prints as '1. question ... answer': one field per question, answer typed beside its number."""
    fields = []
    for number, label, kind in items:
        key = f"{prefix}_q{number:02d}"
        shown = f"{number}. {label}"[:250]
        if kind == "y":
            fields.append(yesno(shown, key=key, w=12))
        elif kind == "n":
            fields.append(num(shown, key=key, w=12))
        elif kind == "t":
            fields.append(text(shown, key=key, w=12))
        else:
            fields.append(area(shown, key=key))
    return fields


def recommendations_table():
    return table_sec("Recommendations", table("recommendations", "Recommendations", [
        col("Recommendation", "recommendation", width=40), colsel("Priority", PRIORITY, "priority"), col("Responsible", "owner"), coldate("Target date", "target"), colsel("Status", STATUS, "status")], min_rows=1))


# ───────────────────────────── green audit questionnaire (college campus) ─────────────────────────────

WATER_Q = [
    (1, "List out the uses of water in your college", "a"), (2, "What are the sources of water in your college?", "t"), (3, "How many wells are there in your college?", "n"),
    (4, "No. of motors used for pumping water from each well", "t"), (5, "What is the total horse power of each motor?", "t"), (6, "What is the depth of each well?", "t"),
    (7, "What is the present depth of water in each well?", "t"), (8, "How does your college store water?", "t"), (9, "Quantity of water stored in your overhead water tank (in litres)", "n"),
    (10, "Quantity of water pumped every day (in litres)", "n"), (11, "If there is water wastage, specify why", "a"), (12, "How can the wastage be prevented / stopped?", "a"),
    (13, "Locate the point of entry of water and the point of exit of waste water in your college", "a"), (14, "Where does waste water come from?", "a"),
    (15, "Where does the waste water go?", "a"), (16, "What are the uses of waste water in your college?", "a"),
    (17, "What happens to the water used in your labs? Whether it gets mixed with ground water?", "a"), (18, "Is there any treatment for the lab water?", "y"),
    (19, "Whether green chemistry methods are practised in your labs", "y"), (20, "Write down four ways that could reduce the amount of water used in your college", "a"),
    (21, "Record water use from the college water meter for six months (fill the meter table below)", "a"), (22, "Bimonthly water charges paid to water connections, if any", "t"),
    (23, "No. of water coolers. Amount of water used per day (in litres)", "t"), (24, "No. of water taps. Amount of water used per day", "t"),
    (25, "No. of bath rooms in staff rooms, common, hostels. Amount of water used per day", "t"), (26, "No. of toilets and urinals. Amount of water used per day", "t"),
    (27, "No. of water taps in the canteen. Amount of water used per day", "t"), (28, "Amount of water used per day for garden use (litres)", "n"),
    (29, "No. of water taps in laboratories. Amount of water used per day in each lab", "t"), (30, "Total use of water in each hostel", "t"),
    (31, "At the end of the period, compile a table to show how many litres of water have been used in the college for each purpose (see the table below)", "a"),
    (32, "Is there any water used for agricultural purposes?", "y"), (33, "Does your college harvest rain water?", "y"),
    (34, "If yes, how many rain water harvesting units are there? (approx. amount)", "t"), (35, "How many of the taps are leaky? Amount of water lost per day", "t"),
    (36, "Are there signs reminding people to turn off the water?", "y"), (37, "Are there any waterless toilets?", "y"), (38, "How many water fountains are there?", "n"),
    (39, "How many water fountains are leaky?", "n"), (40, "Is drip irrigation used to water plants outside?", "y"), (41, "How often is the garden watered?", "t"),
    (42, "Quantity of water used for watering the ground (litres)", "n"), (43, "Quantity of water used for bus cleaning (litres per day)", "n"),
    (44, "Amount of water for other uses (items not mentioned above)", "t"), (45, "Area of the college land without tree / building canopy", "t"),
    (46, "Is there any water management plan in the college?", "a"), (47, "Are there any water saving techniques followed in your college? What are they?", "a"),
    (48, "Please share some ideas for how your college could save more water", "a"),
]

ENERGY_Q = [
    (1, "List ways that you use energy in your college (electricity, electric stove, kettle, microwave, LPG, firewood, petrol, diesel and others)", "a"),
    (2, "Electricity bill amount for the last year", "n"), (3, "Amount paid for LPG cylinders for the last one year", "n"),
    (4, "Weight of firewood used per month and amount of money spent. Also the amount spent for petrol / diesel / others for generators", "a"),
    (5, "Are there any energy saving methods employed in your college? If yes, please specify. If no, suggest some", "a"),
    (6, "How much money does your college spend on energy such as electricity, gas, firewood etc. in a month?", "n"),
    (34, "Are any alternative / non-conventional energy sources employed or installed in your college? (photovoltaic cells for solar energy, windmill, energy efficient stoves etc.) Specify", "a"),
    (35, "Do you run 'switch off' drills at college?", "y"), (36, "Are your computers and other equipment put on power-saving mode?", "y"),
    (37, "Does your machinery (TV, AC, computer, weighing balance, printers etc.) run on standby mode most of the time? If yes, how many hours?", "t"),
    (38, "What are the energy conservation methods adopted by your college?", "a"), (39, "How many boards are displayed for energy saving awareness?", "n"),
    (40, "How much ash is collected after burning firewood per day in the canteen?", "t"),
    (41, "Write a note on the methods / practices / adaptations by which you can reduce the energy use in your college campus in future", "a"),
]

EQUIPMENT = ["CFL bulbs", "LED bulbs", "Incandescent (tungsten) bulbs", "Tube lights", "Fans", "Air conditioners", "Electrical equipment incl. weighing balance", "Computers", "Laptops",
             "Printers", "Photocopiers", "Cooling apparatus", "Inverters / UPS", "Laboratory equipment", "Canteen heaters", "Street lights", "TVs (college and hostels)", "Projectors", "Other"]

WASTE_Q = [
    (1, "What is the total strength of students, teachers and non-teaching staff in your college? (see the strength table)", "a"),
    (2, "No. of students, teachers and non-teaching staff: gents, ladies, total", "a"),
    (3, "Which of the following are available in your college? Give area occupied: garden area, garbage dump, playground, laboratory, kitchen, canteen, toilets, car / scooter shed, number of class rooms, office rooms, others (see the area table)", "a"),
    (4, "Which of the following are found near your college? Mark the level of disturbance it creates on a scale of 1 to 9 (see the table below)", "a"),
    (5, "Does your college generate any waste? If so, what are they? How much quantity?", "a"), (6, "Number or weight of e-waste and hazardous (toxic) waste", "t"),
    (7, "Solid waste, dry leaves, canteen waste, liquid waste, glass, unused equipment, medical waste, napkins, others (specify)", "a"),
    (8, "Is there any waste treatment system in the college?", "a"), (9, "Is there any treatment for toilet / urinal / sanitary napkin waste?", "a"),
    (10, "What is the approximate quantity of waste generated per day (in kilograms): office, laboratories, canteen / kitchen", "a"), (11, "Why is waste a problem?", "a"),
    (12, "Whether waste is polluting ground / surface water. How?", "a"), (13, "Whether waste is polluting the air of the college. How?", "a"),
    (14, "How is the waste generated in the college managed? Methods: composting, recycling, reusing, others (specify)", "a"),
    (15, "How many separate boxes do you think you would need to put into a classroom to start a waste segregation and recycling campaign? What should be the use for each box? (Develop a colour code with reasons)", "a"),
    (16, "Do you use recycled paper in the college?", "y"),
    (17, "Is there any waste wealth programme practised in the college? Approx. biodegradable / non-biodegradable / hazardous / others: less than 1 kg, 2 to 10 kg, more than 10 kg", "a"),
    (18, "How would you spread the message of recycling to others in the community? Have you taken any initiatives? If yes, please specify", "a"),
    (19, "Can you achieve zero garbage in your college? (Reduce, Recycle, Reuse, Refuse) If yes, how?", "a"),
]

PLANT_Q = [
    (1, "Is there a garden in your college? Area?", "a"), (2, "Do students spend time in the garden?", "y"), (3, "List the plants in the garden, with approx. numbers of each species (see the plant tables)", "a"),
    (4, "Suggest plants for your campus (trees, vegetables, herbs etc.)", "a"), (5, "List the species planted by the students, with numbers", "a"),
    (6, "Whether you have displayed scientific names of the trees in the campus", "y"), (7, "Are there any plantations in your campus? If yes, specify area and type of plantation", "a"),
    (8, "Is there any vegetable garden in your college? If yes, how much area?", "a"), (9, "Is there any medicinal garden in your college? If yes, how much area?", "a"),
    (10, "What are the vegetables cultivated in your vegetable garden? (mention the quantity of harvest in each season)", "a"),
    (11, "How much water is used in the vegetable garden and other gardens? (mention the source and quantity of water used)", "a"), (12, "Who is in charge of gardens in your college?", "t"),
    (13, "Are you using any type of recycled water in your garden?", "y"), (14, "List the name and quantity of pesticides and fertilizers used in your gardens", "a"),
    (15, "Whether you are doing organic farming in your college? How?", "a"), (16, "Do you have any composting pit in your college? If yes, what are you doing with the compost generated?", "a"),
    (17, "What are you doing with the vegetables harvested? Do you have any student market?", "a"), (18, "Is there any botanical garden in your campus? If yes, give the details of campus flora", "a"),
    (19, "Give the number and names of the medicinal plants in your college campus (see the medicinal plants table)", "a"), (20, "Any threatened plant species planted / conserved?", "y"),
    (21, "Is there a nature club in your college? If yes, what are their activities?", "a"), (22, "Is there any arboretum in your college? If yes, details of the trees planted", "a"),
    (23, "Is there any fruit yielding plants in your college? If yes, details of the trees planted", "a"), (24, "Is there any grove in your college? If yes, details of the trees planted", "a"),
    (25, "Is there any irrigation system in your college?", "a"), (26, "What is the type of vegetation in the surrounding area of the college?", "t"),
    (27, "What are the nature awareness programmes conducted in the campus?", "a"), (28, "What is the involvement of students in garden maintenance and the green cover maintenance?", "a"),
    (29, "What is the total area of the campus under tree cover / tree canopy?", "t"), (30, "Share your ideas for further improvement of the green cover", "a"),
]

CARBON_Q = [
    (1, "What is the total strength of students and teachers in your college? (see the strength table)", "a"), (2, "Total number of vehicles used by the stakeholders of the college (per day)", "a"),
    (3, "No. of cycles used", "n"), (4, "No. of two wheelers used (average distance travelled and quantity of fuel and amount used per day)", "a"),
    (5, "No. of cars used (average distance travelled and quantity of fuel and amount used per day)", "a"),
    (6, "No. of persons using common (public) transportation (average distance travelled and quantity of fuel and amount used per day)", "a"),
    (7, "No. of persons using college conveyance by the students, non-teaching staff and teachers (average distance travelled and quantity of fuel and amount used per day)", "a"),
    (8, "Number of parent-teacher meetings in a year. Parents turned up (approx.)", "a"), (9, "Number of visitors with vehicles per day", "a"),
    (10, "Number of generators used per day (hours). Give the amount of fuel used per day", "a"), (11, "Number of LPG cylinders used in the canteen (fuel used per day and amount spent)", "a"),
    (12, "Quantity of kerosene used in the canteen / labs (fuel used per day and amount spent)", "a"),
    (13, "Amount of taxi / auto charges paid and the amount of fuel used per month for the transportation of vegetables and other materials to the canteen", "a"),
    (14, "Amount of taxi / auto charges paid per month for the transportation of office goods to the college", "n"),
    (15, "Average amount of taxi / auto charges paid per month by the stakeholders of the college", "n"), (16, "Use of any other fossil fuels in the college (fuel used per day and amount spent)", "a"),
    (17, "Suggest the methods to reduce the quantity of fuel used by the stakeholders / students / teachers / non-teaching staff of the college", "a"),
    (18, "Are the rooms in the campus well ventilated?", "y"),
]


def green_audit():
    reset_keys()
    return form("Environmental Audit Report (Green Audit)", "Green audit of a campus or institution: land use, water, energy, waste, plantation and carbon footprint questionnaires, air quality, noise, recommendations and conclusion.", "GRA", [
        header("Green audit", extra=[text("Institution type", key="institution_type", placeholder="e.g. degree college, school, hospital"), text("Affiliation / board"), text("Year of establishment"),
                                     text("Prepared by (green audit committee)")]),
        sec("1. Introduction",
            area("Need for the environmental audit", key="need"), area("Objectives of the environmental audit", key="objectives",
                                                                       help="Baseline of the environmental conditions; current sustainability practices (water, energy, waste, purchase, transport); awareness; strategies and action plans"),
            area("Specific objectives: water and soil quality, energy consumption pattern, liquid and solid waste, carbon footprint, measures taken, environment management plans, database for corrective actions, recycling activities, gap areas and recommendations", key="specific_objectives"),
            area("About the institution (history, courses, accreditation, staff)", key="about"), cols=1),
        sec("2. Methodology", area("Survey by questionnaire (electricity, water, waste generation, solid waste collection, transport, fuel, hazardous and e-waste)", key="survey"),
            area("Data evaluation", key="evaluation"), cols=1),
        sec("3.1 Land use",
            num("Area of the campus (acres)", key="land_area"), num("Built-up area (sq ft)", key="built_up"), select("Ventilators for natural air flow in all rooms", ["Yes", "No", "Partly"], key="ventilators"),
            num("No. of class rooms", key="classrooms"), num("No. of laboratories", key="labs"), num("No. of conference halls", key="conference"), num("Library halls", key="library"),
            text("Auditorium (open / closed, number)", key="auditorium"), num("Canteen (number)", key="canteen"), text("Any other (please specify)", key="other_structure")),
        table_sec("Student and staff strength", table("strength", "Strength of the institution", [
            colsel("Group", ["Students", "Teaching staff", "Non-teaching staff", "Other"], "group"), colnum("Male", "male", total=True), colnum("Female", "female", total=True),
            colformula("Total", "male + female", "total", total=True)], min_rows=3, totals=True)),
        sec("3.2 Water audit - questionnaire", note("Auditing for water management: answer every question; use the tables below for the quantities."), *qa("water", WATER_Q), cols=1),
        table_sec("Tank capacity by source of water (litres per day)", table("tank", "Tank capacities for various sources of water", [
            colsel("Source", ["Water board (municipal supply)", "Bore well", "Open well", "Tanker", "Rain water harvesting", "Other"], "source"), colnum("Capacity (litres per day)", "capacity", total=True)], min_rows=1, totals=True)),
        table_sec("Utilisation of water per day", table("water_use", "Utilisation of water per day", [
            colsel("Purpose", ["Drinking", "Gardening", "Watering ground", "Kitchen and canteen", "Coolers", "Labs", "Bathrooms", "Washrooms", "Hostel", "Bus cleaning", "Other"], "purpose"),
            colnum("No. of units / taps / labs", "units"), colnum("Consumption (litres per day)", "litres", total=True)], min_rows=1, totals=True)),
        table_sec("Water meter record for six months", table("meter", "Water use from the college water meter", [
            col("Month", "month"), colnum("Meter reading (start)", "start"), colnum("Meter reading (end)", "end"), colformula("Consumption", "end - start", "consumption", total=True),
            colnum("Water charges paid (Rs)", "charges", total=True)], min_rows=6, max_rows=12, totals=True)),
        table_sec("Water quality assessment", table("quality", "Results of water quality (compared with the BIS drinking water standard)", [
            colsel("Parameter", ["Dissolved oxygen (mg/l)", "Acidity (mg/l)", "Alkalinity (mg/l)", "Chloride (mg/l)", "Hardness total (mg/l)", "Conductivity (uS)", "pH", "Total dissolved solids (ppm)",
                                 "Salinity (ppt)", "Total coliform", "Fecal coliform", "Other"], "parameter", width=24),
            col("Bore well water", "borewell"), col("Municipal water", "municipal"), col("Standard value (BIS)", "standard"), colsel("Within the standard", ["Yes", "No", "Not tested"], "within")], min_rows=1),
            description="Samples of bore water and municipal water used for the canteen, drinking water and the cooler systems."),
        sec("3.3 Energy audit - questionnaire", note("Auditing for energy management. Questions 7 to 33 (bulbs, fans, air conditioners, equipment, computers, photocopiers, cooling apparatus, inverters, lab equipment, heaters, street lights, TVs and any other item) are answered in the energy table below: number, use (hours per day, days per month) and energy used."),
            *qa("energy", ENERGY_Q), cols=1),
        table_sec("Energy used by the equipment", table("energy", "Calculation of energy for electrical appliances", [
            col("Appliance / instrument", "appliance", width=20), colsel("Kind", EQUIPMENT, "kind"), colnum("Number", "number"), colnum("Power (W)", "power"),
            colformula("Total power (kW)", "number * power / 1000", "kw", total=True), colnum("Operation (hours per day)", "hours"),
            colformula("Energy per day (kWh)", "number * power * hours / 1000", "kwh_day", total=True), colnum("No. of days in a month", "days"),
            colformula("Energy per month (kWh)", "number * power * hours * days / 1000", "kwh_month", total=True)], min_rows=5, max_rows=120, totals=True,
            description="Average kWh per day = watt x hours x number / 1000. Average kWh per month = kWh per day x number of days.")),
        sec("Solar and other alternative energy", num("Solar capacity installed (kW)", key="solar_kw"), num("Electricity saved by solar (kWh per year)", key="solar_units"),
            text("Source of funding / installer", key="solar_by")),
        sec("3.4 Waste management - questionnaire", note("Types of waste: solid waste (segregation at source into biodegradable, non-biodegradable and domestic hazardous waste), liquid waste (sewage and drains of washrooms and kitchen) and e-waste."),
            *qa("waste", WASTE_Q), cols=1),
        table_sec("Area occupied", table("areas", "Available facilities and the area they occupy", [
            colsel("Facility", ["Garden area", "Garbage dump", "Playground", "Laboratory", "Kitchen and canteen", "Toilets", "Car / scooter shed", "Class rooms", "Principal room", "Office rooms", "Common room", "Auditorium", "Other"], "facility", width=28),
            colnum("Number", "number"), colnum("Area (sq ft)", "area", total=True)], min_rows=1, totals=True)),
        table_sec("Surroundings and level of disturbance", table("surroundings", "Found near the college (level of disturbance 1 to 9)", [
            colsel("Item", ["Municipal dump yard", "Garbage heap", "Public convenience sewer line", "Stagnant water", "Open drainage", "Industry (mention the type)", "Bus stop / railway station", "Market / shopping complex", "Public halls", "Other"], "item", width=30),
            colsel("Present", ["Yes", "No"], "present"), colnum("Level of disturbance (1-9)", "level")], min_rows=1)),
        table_sec("Waste generated", table("waste", "Waste generated in the campus", [
            colsel("Waste", ["Solid waste", "Dry leaves", "Canteen waste", "Liquid waste", "Glass", "Unused equipment", "Medical waste", "Sanitary napkins", "E-waste", "Hazardous waste", "Paper", "Plastic", "Others"], "waste"),
            colnum("Quantity", "quantity", total=True), colsel("Unit", ["kg per day", "kg per month", "kg per year", "litres per day"], "unit"), colsel("Treatment / disposal", ["Composting", "Vermicomposting", "Recycling", "Reuse", "Incineration", "Authorised agency", "Landfill", "Other"], "treatment"),
            col("Remarks", "remarks")], min_rows=1, totals=True)),
        sec("3.5 Plantation audit - questionnaire", note("Auditing for green campus management."), *qa("plant", PLANT_Q), cols=1),
        table_sec("Plants in the ornamental garden (Annexure I)", table("ornamental", "Plants in the ornamental garden", [
            col("Common name", "common"), col("Botanical name", "botanical", width=30), colnum("Number of plants", "number", total=True)], min_rows=1, totals=True)),
        table_sec("Medicinal plants (Annexure II)", table("medicinal", "Medicinal plants", [
            col("Common name", "common"), col("Botanical name", "botanical", width=30), colnum("Number of plants", "number", total=True)], min_rows=1, totals=True)),
        table_sec("Plants with QR codes", table("qr", "Plants given QR codes (botanical name, common name, family, uses)", [
            col("Common name", "common"), col("Botanical name", "botanical", width=30), col("Family", "family"), col("Uses", "uses")], min_rows=0)),
        table_sec("Tree plantation drives", table("drives", "Plantation under a state or institutional programme", [
            col("District", "district"), col("Name of the college", "college"), col("Name of the plant", "plant", width=24), colnum("Number", "number", total=True), col("Year planted", "year"),
            colsel("Survival status", ["Survived", "Partly survived", "Not survived", "Not checked"], "survival")], min_rows=0, totals=True)),
        table_sec("Eco club activities", table("eco", "Eco club and awareness activities", [
            col("Academic year", "year"), col("Activity", "activity", width=24), coldate("Date", "date"), col("Details", "details", width=34)], min_rows=0)),
        sec("Carbon footprint - questionnaire", note("Auditing for carbon footprint."), *qa("carbon", CARBON_Q),
            select("19. Window to floor ratio of the rooms", ["Good", "Not good enough"], key="carbon_q19", w=12), cols=1),
        table_sec("Transport and fuel", table("transport", "Carbon footprint of the stakeholders' transportation", [
            colsel("Mode", ["Cycles", "Two wheelers", "Cars (four wheelers)", "Public transport", "College conveyance", "Generators", "LPG (canteen)", "Kerosene", "Other"], "mode"),
            colnum("No. of vehicles / persons", "count"), colnum("Average distance (km per day)", "distance"), colnum("Fuel used (litres per day)", "fuel", total=True), colnum("Fuel cost per day (Rs)", "cost", total=True),
            colformula("Fuel cost per month (22 days)", "cost * 22", "month_cost", total=True)], min_rows=3, totals=True)),
        sec("Air quality determination", note("Air Quality Index parameters studied or recorded (seasonal)."),
            num("NO2", key="aq_no2", w=4), num("NO", key="aq_no", w=4), num("O3", key="aq_o3", w=4), num("PM2.5", key="aq_pm25", w=4), num("PM10", key="aq_pm10", w=4), num("CO", key="aq_co", w=4),
            num("Humidity (%)", key="aq_humidity", w=4), num("Barometric pressure", key="aq_pressure", w=4), num("Wind speed (km/hour)", key="aq_wind", w=4), text("Wind direction", key="aq_direction", w=4),
            text("Sunrise", key="aq_sunrise", w=4), text("Sunset", key="aq_sunset", w=4), cols=3),
        table_sec("Noise level in and around the college", table("noise", "Measurements of noise level", [
            colsel("Place", ["Library", "Canteen", "Play ground", "Auditorium", "Science block", "Class rooms", "Main gate", "Any other (specify)"], "place"), colnum("Duration (seconds)", "duration"),
            colnum("Minimum (dBA)", "min"), colnum("Maximum (dBA)", "max"), colformula("Average (dBA)", "(min + max) / 2", "avg")], min_rows=4)),
        recommendations_table(),
        sec("5. Conclusion", area("Conclusion (periodic inspection of buildings, housekeeping and environment policy; observations and the points to start urgently)", key="conclusion"),
            area("Points to initiate urgently (e.g. waste management records, inventory of hazardous waste, rainwater recharge, water balance)", key="urgent"), cols=1),
        signoff(),
    ], form_type="AUDIT")


# ───────────────────────────── environment audit report - carbon footprint ─────────────────────────────

FACTORS = [
    ("Average CNG consumption per km travelled (kg)", 0.05), ("Average diesel consumption per km travelled (kg)", 0.07), ("Average petrol consumption per km, two wheeler (kg)", 0.03),
    ("Average petrol consumption per km, four wheeler (kg)", 0.1), ("Travel by metro (kg CO2 per commuter per km)", 0.065), ("Average e-rickshaw travel per person per day (km)", 4),
    ("Emission factor for electricity produced by coal (kgCO2e per kWh)", 0.975), ("Emission factor for N2O from waste water (kg per person-month)", 0.09),
    ("Emission factor for CH4 from waste water (kg per person-month)", 9.0), ("Emission factor for CH4 from solid waste disposal (kg per kg of waste)", 0.9),
    ("CO2 sequestered by one tree (kg per year)", 14), ("CO2 sequestration factor for composting wet waste (kgCO2 per kg wet waste)", -0.103),
    ("CO2 sequestration factor for solar electricity (kgCO2e per kWh)", -0.383),
]

OBJECTIVES = [
    "To create a baseline survey for comparing and measuring the progress",
    "To examine the current practices and their contribution in terms of CO2 equivalence",
    "To compare, innovate and install green and alternative sources of energy",
    "To reduce dependencies on energy obtained from fossil fuels",
    "To identify and mitigate the problems of waste disposal and water management practices",
    "To enhance the growth of the green cover of the campus",
    "To enhance environmental consciousness for sustainable use of resources",
    "To identify and assess environmental risk, if any",
]


def _html_list(items, ordered=True):
    tag = "ol" if ordered else "ul"
    return f"<{tag}>" + "".join(f"<li>{item}</li>" for item in items) + f"</{tag}>"


GHG_NOTE = "*Note: CO2 emission in the form of biogas or CH4 oxidation is not counted in GHG inventories."

PLASTIC_STEPS = [
    "Awareness and education: educate the college community about the environmental impact of plastic waste through awareness campaigns by the eco club; engage students, faculty and staff to promote behavioural change such as reducing plastic consumption and proper waste disposal.",
    "Reduce plastic usage: encourage reusable alternatives such as stainless steel water bottles, cloth bags and reusable containers.",
    "Plastic waste collection and segregation: educate the campus community on how to segregate plastic waste properly to improve the effectiveness of recycling.",
    "Partnerships and collaborations: collaborate with an NGO that collects the plastic waste to recycle it into useful items such as bins and benches.",
]

CARBON_STEPS = [
    "Commitment, towards becoming carbon-neutral and achieving carbon-neutral goals",
    "Counting and analysis, of the total resource consumption by compiling an inventory using a GHG calculator and emission factors",
    "Action, in starting to work towards GHG neutrality",
    "Reduction, by limiting energy usage in transportation and electricity and minimising waste generation",
    "Offsetting, by neutralising the volume of GHGs through funding projects supporting solar panel installation, biogas plants and rainwater harvesting",
    "Evaluation and repeating, of the results and targets, and compiling the list of suggestions and improvements",
]


def carbon_audit():
    reset_keys()
    return form("Environment Audit Report - Carbon Footprint", "Carbon footprint environment audit of a campus: CO2 from transport and electricity, GHG from waste water and solid waste, carbon sinks and best practices, figures, species list and the carbon-neutral strategy.", "CFA", [
        sec("Cover page",
            picture("Institution logo / emblem (cover page)", key="logo", help="PNG or JPEG; printed in the downloaded report"),
            text("Report title", key="report_title", default="Environment Audit Report", w=8), text("Year of the report", key="report_year", w=4),
            text("Under the aegis of (IQAC / committee)", key="aegis"), text("Prepared by", key="prepared_by"),
            note(GHG_NOTE), cols=2),
        header("Environment audit report", extra=[text("Reporting year / period", key="period", placeholder="e.g. January to December 2023"), text("University / affiliation", key="university")]),
        sec("Strength and working days",
            num("Students - day scholars", key="day_scholars"), num("Students - hostellers", key="hostellers"), num("Teaching staff", key="teaching"), num("Non-teaching staff", key="non_teaching"),
            formula("Total strength", "day_scholars + hostellers + teaching + non_teaching", key="strength"), num("Working days in the year", key="working_days"),
            num("Students who answered the survey (approx.)", key="respondents"), text("Period of data collection", key="collection_period", placeholder="e.g. January 2023 for final years, February to December for the college"),
            text("Departments / blocks surveyed", key="surveyed", w=12),
            multi("The audit is carried out for", ["CO2 emission from transportation (carbon auditing)", "CO2 emission from energy consumption (energy auditing)",
                                                     "GHG emission from waste water and solid waste (water and waste auditing)", "Other potential CO2 sinks in the college"], key="scope", w=12)),
        sec("1. Introduction",
            rich("Introduction (carbon footprint audit, GHG inventory baseline, solar panels, tree planting, comparative overview of energy, water, waste and transport)", key="introduction"),
            rich("2. Goals of the environment audit", key="goals", default=_html_list(OBJECTIVES)),
            rich("3. Methodology (survey forms from students, teaching and non-teaching staff; departments, administrative buildings, canteen and hostels)", key="methodology"),
            rich("Initiatives started this year (e.g. plastic waste collected from all arenas of the college and given weekly to an NGO for recycling)", key="initiatives"), cols=1),
        sec("Emission factors and constants used", note("Constants of the sample report; change a value when the audit uses a different published factor."),
            *[num(label, key=f"factor_{i:02d}", default=value) for i, (label, value) in enumerate(FACTORS, start=1)]),

        sec("1.1 CO2 emission from transportation - components of the calculation",
            rich("A carbon footprint is the total greenhouse gas emissions caused directly and indirectly by an individual, organisation, event or product (description used in the report)", key="transport_intro",
                 default="<p>A carbon footprint is the total greenhouse gas emissions caused directly and indirectly by an individual, organisation, event or product. It is calculated by summing the emissions resulting from every stage of a product or service's lifetime.</p>"),
            note("The net kg CO2 equivalence is calculated from the data and the equivalence constants for the various fuel types. Activity (total fuel consumption in litres) x emission factor (kg of CO2 per litre of fuel) = CO2 equivalence (CO2e) of emissions. Fuel consumption per person = distance (km) x average fuel consumption (litres per km)."),
            text("How the data was collected", key="transport_method", placeholder="e.g. Google form survey circulated to students, teaching and non-teaching staff", w=12),
            text("Areas covered (academic block, administrative building, canteen and hostel area)", key="transport_areas", w=12), cols=1),
        table_sec("Table 1.1 - Total distance (km), mode of transportation wise", table("modes", "Total distance (km) by mode of transportation", [
            col("Department", "department", width=14),
            colnum("4 wheeler - petrol", "w4_petrol", total=True), colnum("4 wheeler - CNG", "w4_cng", total=True), colnum("4 wheeler - diesel", "w4_diesel", total=True), colnum("4 wheeler - electricity", "w4_electric", total=True),
            colnum("2 wheeler - petrol", "w2_petrol", total=True), colnum("2 wheeler - electricity", "w2_electric", total=True), colnum("E-rickshaw - electricity", "erickshaw", total=True),
            colnum("Metro - electricity", "metro", total=True), colnum("Bus - CNG", "bus", total=True),
            colformula("Total distance (km)", "w4_petrol + w4_cng + w4_diesel + w4_electric + w2_petrol + w2_electric + erickshaw + metro + bus", "total", total=True)],
            min_rows=2, max_rows=20, totals=True, description="One row per department or block (Academic, Administrative ...); the total row is worked out for you.")),
        table_sec("Total distance, fuel wise (Table 1.3)", table("fuel_wise", "Total distance fuel wise", [
            col("Department", "department", width=16), colnum("Petrol (L)", "petrol", total=True), colnum("CNG (kg)", "cng", total=True), colnum("Diesel (L)", "diesel", total=True),
            colnum("Electrical", "electrical", total=True), colformula("Total", "petrol + cng + diesel + electrical", "total", total=True)], min_rows=2, max_rows=20, totals=True)),
        table_sec("Total distance, total fuel consumption and total kgCO2 equivalence", table("transport_summary", "Total distance (km), total fuel consumption (L) and total kgCO2 equivalence emission of the college (academic and administrative blocks)", [
            colsel("Parameter", ["Total distance", "Total fuel (only petrol, diesel and CNG)", "Total kgCO2 equivalence emission"], "parameter", width=40), colnum("Academic", "academic"), colnum("Administrator", "administrative"),
            colformula("College total", "academic + administrative", "total")], min_rows=3, max_rows=3)),
        table_sec("Table 1.2 - Distance travelled and CO2 by vehicle type", table("table_1_2", "Total distance travelled by 4-wheelers, 2-wheelers and public transportation", [
            col("Department", "department", width=16), colnum("Distance (km) - 4 wheeler", "d4", total=True), colnum("CO2 (kg) - 4 wheeler", "c4", total=True), colnum("Distance (km) - 2 wheeler", "d2", total=True),
            colnum("CO2 (kg) - 2 wheelers", "c2", total=True), colnum("Distance (km) - public transport", "dp", total=True), colnum("CO2 (kg) - public transport", "cp", total=True)], min_rows=2, max_rows=20, totals=True)),
        table_sec("CO2 equivalence calculation (activity x emission factor)", table("transport", "Distance, fuel and CO2 equivalence by block and mode", [
            col("Block / department", "block"),
            colsel("Mode", ["Four wheeler - petrol", "Four wheeler - CNG", "Four wheeler - diesel", "Four wheeler - electric", "Two wheeler - petrol", "E-rickshaw", "Metro", "Bus (CNG)", "Other"], "mode", width=20),
            colnum("Total distance (km)", "distance", total=True), colnum("Fuel consumption per km (L or kg)", "per_km"), colformula("Total fuel (L or kg)", "distance * per_km", "fuel", total=True),
            colnum("Emission factor (kg CO2 per unit of fuel)", "factor"), colformula("kg CO2e", "fuel * factor", "co2", total=True)], min_rows=4, max_rows=60, totals=True,
            description="Use the constants of the section above (average fuel consumption per km) and the emission factor of your chosen source.")),
        sec("Transport - results and figures",
            num("kgCO2e consumption of the college through transportation (kg CO2e per month)", key="transport_month"), num("Total annual CO2 emission from transportation (kg CO2e)", key="transport_year"),
            formula("Total annual CO2 emission from transportation (tonnes CO2e)", "transport_year / 1000", key="transport_tonnes"),
            upload("Fig 1.1 - Total distance (km), total fuel consumption (L) and total kgCO2 equivalence emission (academic and administrative blocks): chart", key="fig_1_1"),
            upload("Fig 1.2 - Total distance travelled by 4-wheelers, 2-wheelers and public transportation, and emission of CO2 (kg): chart", key="fig_1_2"),
            upload("Fig 1.3 - Total distance travelled fuel wise: chart", key="fig_1_3"),
            rich("1.2 Results and discussion (main contributor: public transport, then two wheelers, then four wheelers)", key="transport_results"), cols=1),

        sec("2. CO2 emission from electricity",
            note("The electricity from the state board comes mostly from thermal power based grid units, so the emission factor for coal is used (0.975 kgCO2e per kWh) and the emission is indirect. Data is collected for the academic and administrative buildings and hostels in three categories. Category I: AC (variable refrigerant flow, non-VRF), fans and tubelights. Category II: desktop computers. Category III: electrical and electronic gadgets, instruments (heavy and light machines), charging devices (laptops, mobile phones), photocopier machines, printers, bulbs, microwaves and refrigerators."),
            note("kWh per month = (rating in watts / 1000 x usage in hours per day x number of working days in a year) / 12 months. Activity (total electricity consumption in kWh) x emission factor (kg of CO2 per kWh) = CO2 equivalence (CO2e)."), cols=1),
        table_sec("Equipment-wise consumption (rating x hours x working days)", table("equipment", "Electricity consumption by equipment", [
            col("Department / block", "department", width=16), colsel("Category", ["I - AC, fans, tubelights", "II - desktop computers", "III - gadgets, instruments, chargers, printers, bulbs, microwaves, refrigerators"], "category", width=18),
            col("Equipment", "equipment", width=16), colnum("Number", "number"), colnum("Rating (W)", "rating"), colnum("Usage (hours per day)", "hours"), colnum("Working days in a year", "days"),
            colformula("kWh per day", "number * rating / 1000 * hours", "kwh_day", total=True), colformula("kWh per month", "number * rating / 1000 * hours * days / 12", "kwh_month", total=True)],
            min_rows=3, max_rows=300, totals=True)),
        table_sec("Table II.1 - Department-wise consumption of electricity by categories I, II and III", table("electricity", "Department-wise consumption of electricity by categories I, II and III", [
            col("Department / sub-division (academic departments, administrative building, hostel ...)", "department", width=24),
            colnum("Category I - AC, fans, tubelights (kWh/day)", "cat1", total=True), colnum("Category II - desktop computers (number)", "computers", total=True), colnum("Category II (kWh/day)", "cat2", total=True),
            colnum("Category III - gadgets, instruments, chargers, printers, bulbs, microwaves, refrigerators (kWh/day)", "cat3", total=True),
            colformula("Total (kWh/day)", "cat1 + cat2 + cat3", "total", total=True), colformula("CO2e (kg/day) at 0.975 kgCO2e per kWh", "(cat1 + cat2 + cat3) * 0.975", "co2", total=True)], min_rows=4, max_rows=60, totals=True)),
        table_sec("Break up of the category I equipment", table("cat1_breakup", "Electricity consumption by category I equipment", [
            colsel("Equipment", ["VRV AC units", "Non-VRV AC units", "Fans", "Tube lights", "Other"], "equipment"), colnum("kWh per day", "kwh", total=True)], min_rows=4, totals=True)),
        sec("2.2 Calculations and results", num("Total electricity consumption per day (kWh)", key="elec_day"), formula("Total CO2e emission per day (kg)", "elec_day * 0.975", key="elec_co2_day"),
            formula("Total annual CO2e emission (tonnes)", "elec_day * 0.975 * 365 / 1000", key="elec_co2_year"),
            upload("Fig 2.1 - Distribution of electricity consumption for category II and category III (kWh per day) in the departments: chart", key="fig_2_1"),
            rich("2.3 Results and discussions (departments with the highest electricity consumption)", key="elec_results")),

        sec("3. GHG emissions from waste water and solid waste",
            note("This section covers 3.1 Water auditing and 3.2 Waste auditing. The water audit covers the total water consumption of the college and the N2O and CH4 emissions from the waste water treatment unit: N2O is released from nitrification and CH4 from the breaking of organic compounds during disposal of the waste water. The contribution of day scholars, teaching and non-teaching staff who stay only during working hours is taken as 50 percent of the hostellers who live on the campus. The GHG emission for the waste is estimated by calculating the CH4 emission per kg of solid waste released at the dumping site."),
            text("3.1 Water audit - period of the data", key="water_period", placeholder="e.g. January to April 2023 for the final semester students, February to December 2023 for the whole college", w=12),
            text("Sections covered (departments of the academic block, administration building, hostels)", key="water_sections", w=12), cols=1),
        table_sec("Consumption of water by the blocks", table("water_blocks", "Consumption of water by the blocks", [
            colsel("Block", ["Administration", "Academic", "Hostel, teaching and non-teaching", "Canteen", "Other"], "block", width=40), colnum("Consumption of water (litres per month)", "litres", total=True)], min_rows=3, totals=True)),
        table_sec("Consumption of water by the departments", table("water_departments", "Consumption of water by the departments of the academic block and other areas", [
            col("Department / area (canteen, hostel and staff quarters, each department)", "department", width=40), colnum("Consumption of water (litres per month)", "litres", total=True)], min_rows=4, max_rows=60, totals=True)),
        sec("Consumption of water by purpose",
            num("Sanitation (litres per month)", key="water_sanitation", w=3), num("Drinking water (litres per month)", key="water_drinking", w=3), num("Laboratory (litres per month)", key="water_lab", w=3), num("Miscellaneous (litres per month)", key="water_misc", w=3),
            formula("Total water consumption (litres per month)", "water_sanitation + water_drinking + water_lab + water_misc", key="water_total"),
            formula("Sanitation share (%)", "IF(water_total == 0, 0, ROUND(water_sanitation / water_total * 100, 2))", key="share_sanitation", w=4),
            formula("Drinking water share (%)", "IF(water_total == 0, 0, ROUND(water_drinking / water_total * 100, 2))", key="share_drinking", w=4),
            formula("Laboratory share (%)", "IF(water_total == 0, 0, ROUND(water_lab / water_total * 100, 2))", key="share_lab", w=4), cols=3),
        sec("Water - GHG from waste water and figures",
            note("Where the dirty water is treated by the municipal body the N2O and CH4 equivalence is not calculated."),
            select("Waste water treatment", ["Treated by the municipal body (no calculation)", "Treated on the campus", "Septic tank / soak pit"], key="ww_treatment"),
            num("Persons living on the campus (hostellers, wardens, caretakers)", key="ww_resident"), num("Persons staying only during working hours", key="ww_day"), num("Number of months", key="ww_months", default=12),
            formula("Total kg N2O per year", "(ww_resident + ww_day * 0.5) * ww_months * 0.09", key="n2o"), formula("Total kg CH4 per year", "(ww_resident + ww_day * 0.5) * ww_months * 9", key="ch4_ww"),
            upload("Fig 3.1.1 - Consumption of water by the blocks of the college (litres per month): chart", key="fig_3_1_1"),
            upload("Fig 3.1.2 - Consumption of water by the departments of the academic block and other areas: chart", key="fig_3_1_2"),
            upload("Fig 3.1.3 - Consumption of water for various purposes (litres per month): chart", key="fig_3_1_3"),
            rich("3.1.2 Results and discussion (total consumption; sanitation, drinking and laboratory share; the highest consuming department)", key="water_results")),

        sec("3.2 Waste audit",
            note("The waste audit covers the whole college: the departments of the academic block, the administration building and the hostels. The paper waste and e-waste recycled by the college and the wet waste managed through composting are not included in the solid waste used for the CH4 calculation."),
            num("Days of data: students", key="days_students", default=60), num("Days of data: administration", key="days_admin", default=120), num("Days of data: wardens and caretakers (staying on the premises)", key="days_wardens", default=360), cols=3),
        table_sec("Distribution of the waste generated by location", table("waste", "Distribution of the waste generated through different processes by the departments", [
            col("Location / department", "location", width=18), colnum("Waste generated total (kg/day)", "total", total=True), colnum("Paper waste", "paper", total=True), colnum("Sanitary waste", "sanitary", total=True),
            colnum("Plastic waste", "plastic", total=True), colnum("Others", "others", total=True), colnum("Lab waste - glass", "glass", total=True), colnum("Lab waste - e-waste", "ewaste", total=True),
            colnum("Lab waste - dry / solid", "dry", total=True), colnum("Lab waste - wet (L)", "wet", total=True), colnum("Lab waste - needle", "needle", total=True),
            colnum("Biological waste / food waste", "biological", total=True)], min_rows=5, max_rows=60, totals=True,
            description="Locations: administrative block, hostel, staff quarters / warden's quarters, canteen and each department.")),
        sec("Waste - GHG, results and figures",
            num("Solid waste sent for disposal (kg per year)", key="swd_kg"), formula("Total kg CH4 per year from solid waste", "swd_kg * 0.9", key="ch4_swd"),
            num("E-waste generated (kg per day)", key="ewaste_day"), num("Paper waste sent for recycling (%)", key="paper_recycled"), num("Wet waste recycled through composting (%)", key="wet_composted"),
            num("Paper waste given to an NGO (kg per day)", key="paper_ngo"), num("Wet and food waste used in the composting units (kg per day)", key="wet_compost_kg"),
            num("Wet waste that forms part of the sewage waste (kg per day)", key="wet_sewage"), num("Waste given away to the municipal vans (kg per day)", key="waste_municipal"),
            upload("Fig 3.2.1 - Distribution of the waste generated by the departments of the academic block: chart", key="fig_3_2_1"),
            upload("Fig 3.2.2 - Distribution of the waste generated by the blocks of the college: chart", key="fig_3_2_2"),
            rich("3.2.2 Results and discussion", key="waste_results")),

        sec("4. Best practices to reduce the carbon footprint",
            note("4.1 Tree cover: on average one tree sequesters about 14 kg of CO2 per year."),
            num("Approximate number of trees in the campus", key="trees"), formula("CO2 sequestered by trees (kg per year)", "trees * 14", key="trees_co2"),
            note("4.2 Composting: CO2 sequestration factor for wet waste used for compost is -0.103 kgCO2 per kg of wet waste."),
            num("Wet waste generated and composted (kg per day)", key="compost_kg"), formula("CO2 sequestered by composting (kg per year)", "compost_kg * 365 * 0.103", key="compost_co2"),
            note("4.3 Alternative energy - solar panels: the CO2 sequestration factor for 1 kWh of solar electricity is -0.383 kgCO2e."),
            num("Number of solar panels", key="solar_panels"), num("Electricity produced by each panel (kWh per day)", key="solar_per_panel"),
            num("Solar electricity generated (kWh per year)", key="solar_kwh"), formula("CO2 avoided by solar power (kg per year)", "solar_kwh * 0.383", key="solar_co2"),
            text("Eco club of the college", key="eco_club"), text("Partner organisation (NGO) collecting the plastic waste", key="ngo"),
            rich("4.4 Managing plastic waste at the college: the steps followed", key="plastic_steps", default=_html_list(PLASTIC_STEPS)),
            upload("Photographs (solar panels, composting pits, tree plantation, plastic waste collection)", key="photos_practices")),
        table_sec("Plastic waste given for recycling", table("plastic", "Plastic waste collected by the partner organisation", [
            col("Year", "year"), colsel("Month", ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"], "month"),
            colnum("Weight (kg)", "weight", total=True)], min_rows=1, totals=True)),

        sec("5. Future strategies for making the campus carbon-neutral",
            rich("Future strategies and suggestions (educating students on sustainable environment, promoting public transport, plantation drives, non-plastic bags and utensils, eco club, solar panels, water harvesting, composting pits, organic manure)", key="strategies"),
            multi("Steps followed towards carbon neutrality", CARBON_STEPS, key="steps", w=12),
            upload("Fig 5.1 - Different areas where the institution is working to become carbon-neutral (how we reduce waste, create and use energy, travel, produce and manage waste, conduct environment auditing, work through eco-clubs ...): diagram", key="fig_5_1"),
            rich("Conclusion (all the indicators of the environmental audit report were studied, analysed and followed with the conclusions, recommendations and solutions)", key="conclusion"), cols=1),
        table_sec("Table 5.1 - Species on the campus", table("species", "List of categories of different species of plants on the campus", [
            colsel("Category", ["Fruit trees", "Ornamental trees / plants", "Herbs and shrubs", "Medicinal plants", "Timber trees", "Other"], "category"), col("Common name (local name)", "common"),
            col("Scientific name (genus species)", "scientific", width=30), colnum("Number", "number", total=True)], min_rows=1, max_rows=200, totals=True)),
        sec("6. Awards for environment sustainability",
            rich("Awards and recognitions (visits, the parameters assessed, awards received)", key="awards_text"),
            upload("Award certificates, letters and photographs", key="awards_files"), cols=1),
        table_sec("Awards and recognitions", table("awards", "Awards and recognitions", [
            coldate("Date", "date"), col("Awarding agency", "agency", width=26), col("Parameters assessed (sanitation, water, energy, solid waste, green cover ...)", "parameters", width=30), col("Award / recognition", "award", width=24)], min_rows=0)),
        sec("Summary of emissions", num("Transport (kg CO2e per year)", key="sum_transport"), num("Electricity (kg CO2e per year)", key="sum_electricity"), num("Waste water N2O and CH4 (kg CO2e per year)", key="sum_water"),
            num("Solid waste CH4 (kg CO2e per year)", key="sum_waste"), num("Sinks: trees, composting and solar (kg CO2e per year)", key="sum_sinks"),
            formula("Net CO2e (kg per year)", "sum_transport + sum_electricity + sum_water + sum_waste - sum_sinks", key="sum_net")),
        recommendations_table(),
        table_sec("7. Resources", table("references", "References used (emission factors, GHG inventory guidelines)", [
            col("Reference", "reference", width=40), col("Publisher / agency", "publisher"), col("Report no.", "number"), col("Place and date", "date"), col("Link", "link", width=24)], min_rows=1)),
        sec("Supporting documents",
            upload("Survey forms, Google form responses and data sheets", key="survey_files"), upload("Electricity bills, water and waste records, meter readings", key="records_files"),
            upload("Any other attachment", key="other_files"), cols=1),
        signoff(),
    ], form_type="AUDIT")


# The two reports are not forms of their own: forms_catalogue_aa_environment.py integrates them into the Environmental Audit Report.
