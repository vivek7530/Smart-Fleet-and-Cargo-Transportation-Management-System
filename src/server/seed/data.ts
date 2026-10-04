/** Static, realistic reference data used to build the development dataset. */

export const MANAGERS = [
  {
    name: 'Priya Sharma',
    email: 'priya.sharma@cargoentry.dev',
    mobile: '+919820114477',
    designation: 'Operations Manager — West',
  },
  {
    name: 'Rahul Menon',
    email: 'rahul.menon@cargoentry.dev',
    mobile: '+919845220913',
    designation: 'Fleet Manager — South',
  },
  {
    name: 'Aisha Khan',
    email: 'aisha.khan@cargoentry.dev',
    mobile: '+919711805562',
    designation: 'Logistics Manager — North',
  },
];

export const DRIVERS = [
  { name: 'Ramesh Yadav', mobile: '+919822104561', licenseNumber: 'MH12 20180004561', experienceYears: 12 },
  { name: 'Suresh Patil', mobile: '+919823117742', licenseNumber: 'MH14 20150011203', experienceYears: 9 },
  { name: 'Gurpreet Singh', mobile: '+919872240118', licenseNumber: 'PB10 20170007745', experienceYears: 15 },
  { name: 'Mohammed Irfan', mobile: '+919845331209', licenseNumber: 'KA05 20190003318', experienceYears: 6 },
  { name: 'Deepak Rathore', mobile: '+919829440376', licenseNumber: 'RJ14 20160009982', experienceYears: 11 },
  { name: 'Sanjay Verma', mobile: '+919811556420', licenseNumber: 'DL09 20140002217', experienceYears: 18 },
  { name: 'Vikram Chauhan', mobile: '+919825663310', licenseNumber: 'GJ01 20200001194', experienceYears: 5 },
  { name: 'Arun Nair', mobile: '+919846770285', licenseNumber: 'KL07 20180006603', experienceYears: 8 },
  { name: 'Balbir Kaur', mobile: '+919878881146', licenseNumber: 'PB08 20190004472', experienceYears: 7 },
  { name: 'Prakash Jadhav', mobile: '+919820993318', licenseNumber: 'MH04 20130008851', experienceYears: 20 },
];

export const TRUCK_MODELS = [
  { make: 'Tata Motors', model: 'Signa 4825.TK', capacityTons: 42, mileage: 3.4, price: 4_850_000 },
  { make: 'Tata Motors', model: 'Prima 2830.K', capacityTons: 28, mileage: 3.9, price: 3_640_000 },
  { make: 'Ashok Leyland', model: 'AVTR 4825', capacityTons: 41, mileage: 3.5, price: 4_720_000 },
  { make: 'Ashok Leyland', model: 'Ecomet 1615', capacityTons: 16, mileage: 5.1, price: 2_180_000 },
  { make: 'BharatBenz', model: '3532R', capacityTons: 35, mileage: 3.8, price: 4_310_000 },
  { make: 'BharatBenz', model: '1917R', capacityTons: 19, mileage: 4.7, price: 2_690_000 },
  { make: 'Eicher', model: 'Pro 6055', capacityTons: 25, mileage: 4.2, price: 3_120_000 },
  { make: 'Eicher', model: 'Pro 2110XP', capacityTons: 11, mileage: 6.0, price: 1_760_000 },
  { make: 'Mahindra', model: 'Blazo X 55', capacityTons: 49, mileage: 3.3, price: 5_040_000 },
  { make: 'Volvo', model: 'FM 420 8x2', capacityTons: 37, mileage: 3.1, price: 6_450_000 },
];

export const STATE_CODES = ['MH', 'GJ', 'KA', 'DL', 'RJ', 'TN', 'PB', 'UP', 'HR', 'MP'];

/** Real freight corridors with plausible distances and per-trip revenue bands. */
export const ROUTES = [
  { from: 'Mumbai, MH', to: 'Delhi, DL', km: 1420, revenue: [118_000, 152_000] },
  { from: 'Ahmedabad, GJ', to: 'Pune, MH', km: 660, revenue: [54_000, 71_000] },
  { from: 'Chennai, TN', to: 'Bengaluru, KA', km: 350, revenue: [31_000, 42_000] },
  { from: 'Delhi, DL', to: 'Jaipur, RJ', km: 280, revenue: [24_000, 33_000] },
  { from: 'Kolkata, WB', to: 'Ranchi, JH', km: 410, revenue: [36_000, 47_000] },
  { from: 'Hyderabad, TS', to: 'Nagpur, MH', km: 500, revenue: [43_000, 56_000] },
  { from: 'Surat, GJ', to: 'Indore, MP', km: 590, revenue: [48_000, 63_000] },
  { from: 'Ludhiana, PB', to: 'Delhi, DL', km: 320, revenue: [27_000, 36_000] },
  { from: 'Kochi, KL', to: 'Coimbatore, TN', km: 190, revenue: [17_000, 24_000] },
  { from: 'Mumbai, MH', to: 'Bengaluru, KA', km: 980, revenue: [82_000, 108_000] },
  { from: 'Vadodara, GJ', to: 'Mumbai, MH', km: 420, revenue: [35_000, 46_000] },
  { from: 'Kanpur, UP', to: 'Lucknow, UP', km: 90, revenue: [9_000, 14_000] },
];

export const CARGO_TEMPLATES = [
  { description: 'Palletised FMCG cartons', type: 'GENERAL', weight: [8, 22], value: [420_000, 1_400_000] },
  { description: 'Refrigerated dairy consignment', type: 'REFRIGERATED', weight: [6, 16], value: [560_000, 1_800_000] },
  { description: 'Ceramic floor tiles', type: 'FRAGILE', weight: [14, 28], value: [310_000, 980_000] },
  { description: 'Industrial lubricants in drums', type: 'LIQUID', weight: [12, 24], value: [640_000, 1_500_000] },
  { description: 'Textile bales — cotton yarn', type: 'GENERAL', weight: [9, 19], value: [380_000, 1_100_000] },
  { description: 'Automotive spare parts', type: 'GENERAL', weight: [5, 14], value: [720_000, 2_400_000] },
  { description: 'Pharmaceutical cold chain boxes', type: 'PERISHABLE', weight: [3, 9], value: [1_200_000, 4_100_000] },
  { description: 'Steel coils', type: 'OVERSIZED', weight: [20, 38], value: [1_450_000, 3_600_000] },
  { description: 'Bagged cement', type: 'GENERAL', weight: [18, 32], value: [180_000, 460_000] },
  { description: 'Packaged agrochemicals', type: 'HAZARDOUS', weight: [7, 15], value: [520_000, 1_300_000] },
  { description: 'Consumer electronics — sealed cartons', type: 'FRAGILE', weight: [4, 11], value: [2_100_000, 6_800_000] },
  { description: 'Export containers to port', type: 'CONTAINER', weight: [16, 30], value: [980_000, 2_900_000] },
];

export const SHIPPERS = [
  'Everest Consumer Goods Pvt Ltd',
  'Sundaram Textiles Ltd',
  'Nimbus Cold Chain Solutions',
  'Rathi Steel & Alloys',
  'Kaveri Agro Industries',
  'Shakti Cement Corporation',
  'Meridian Pharma Labs',
  'Zenith Auto Components',
];

export const CONSIGNEES = [
  'Bharat Retail Distribution',
  'GreenLeaf Wholesale Mart',
  'Apex Industrial Supplies',
  'Southern Trade Links',
  'Metro Warehouse & Logistics',
  'Prime Builders Depot',
  'Nova Healthcare Distributors',
  'Continental Motors Depot',
];

export const FUEL_STATIONS = [
  'Indian Oil — NH48 Truck Bay',
  'HP Petrol Pump — Dhaba Junction',
  'Bharat Petroleum — Ring Road',
  'Reliance Fuel Point — Bypass',
  'Nayara Energy — Highway Plaza',
  'Shell Select — Expressway',
];

export const SERVICE_PROVIDERS = [
  'Sai Auto Works',
  'Tata Motors Authorised Service',
  'Ashok Leyland Care Centre',
  'National Tyre Retreads',
  'Highway Diesel Clinic',
  'Precision Brake & Clutch',
];

export const MAINTENANCE_JOBS: { type: string; description: string; cost: [number, number] }[] = [
  { type: 'ROUTINE_SERVICE', description: 'Scheduled 20,000 km service — engine oil, filters and general inspection', cost: [12_000, 24_000] },
  { type: 'TYRE', description: 'Replaced four rear tyres and wheel alignment', cost: [48_000, 96_000] },
  { type: 'BRAKES', description: 'Brake shoe replacement and air line overhaul', cost: [18_000, 34_000] },
  { type: 'ENGINE', description: 'Turbocharger repair and injector calibration', cost: [62_000, 145_000] },
  { type: 'ELECTRICAL', description: 'Alternator rewinding and battery replacement', cost: [14_000, 29_000] },
  { type: 'AC_COOLING', description: 'Cabin AC compressor service and gas refill', cost: [9_000, 18_000] },
  { type: 'INSPECTION', description: 'Annual fitness certificate inspection and rectifications', cost: [7_000, 15_000] },
  { type: 'BODYWORK', description: 'Container body panel repair and repainting', cost: [22_000, 48_000] },
];

export const EXPENSE_TEMPLATES: { type: string; description: string; amount: [number, number] }[] = [
  { type: 'FOOD', description: 'Meals during the haul', amount: [350, 1_400] },
  { type: 'LODGING', description: 'Overnight rest stop', amount: [600, 2_200] },
  { type: 'TOLL', description: 'FASTag top-up for highway tolls', amount: [1_800, 6_500] },
  { type: 'PARKING', description: 'Overnight truck parking charges', amount: [200, 900] },
  { type: 'REPAIR', description: 'Roadside puncture repair', amount: [800, 4_500] },
  { type: 'LOADING', description: 'Labour charges at the loading point', amount: [1_200, 4_800] },
  { type: 'MISC', description: 'Miscellaneous on-road expense', amount: [300, 1_800] },
];

export const TRANSPORT_COST_TEMPLATES: { type: string; description: string; amount: [number, number] }[] = [
  { type: 'TOLL', description: 'Highway toll charges for the route', amount: [3_200, 11_000] },
  { type: 'PERMIT', description: 'Interstate permit and border charges', amount: [1_500, 6_400] },
  { type: 'LOADING', description: 'Loading labour at origin warehouse', amount: [2_400, 7_800] },
  { type: 'UNLOADING', description: 'Unloading labour at destination', amount: [2_200, 7_200] },
  { type: 'WEIGHBRIDGE', description: 'Weighbridge verification fee', amount: [300, 900] },
  { type: 'BROKERAGE', description: 'Freight broker commission', amount: [2_000, 9_000] },
];

export const BREAKDOWN_TEMPLATES: { description: string; severity: string }[] = [
  { description: 'Rear left tyre burst on the expressway, vehicle pulled over on the shoulder', severity: 'HIGH' },
  { description: 'Coolant leak causing the engine temperature to spike above safe limits', severity: 'CRITICAL' },
  { description: 'Air pressure dropping intermittently, brake warning buzzer active', severity: 'HIGH' },
  { description: 'Headlamp assembly failure — unable to continue after dark', severity: 'MEDIUM' },
  { description: 'Cabin AC blower stopped working, uncomfortable but drivable', severity: 'LOW' },
  { description: 'Clutch slipping on inclines, gear engagement rough', severity: 'MEDIUM' },
];

export const INSURERS = [
  'ICICI Lombard General Insurance',
  'Bajaj Allianz General Insurance',
  'HDFC ERGO General Insurance',
  'New India Assurance',
  'TATA AIG General Insurance',
];
