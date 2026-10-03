/** Built-in word banks used by the offline data generators. */

export const FIRST_NAMES = [
  'Emma', 'Liam', 'Olivia', 'Noah', 'Ava', 'Elijah', 'Sophia', 'Lucas', 'Mia', 'Mateo',
  'Amelia', 'Oliver', 'Isabella', 'James', 'Charlotte', 'Benjamin', 'Harper', 'Leo', 'Evelyn', 'Henry',
  'Aria', 'Jack', 'Chloe', 'William', 'Nora', 'Daniel', 'Zoe', 'Samuel', 'Layla', 'David',
  'Freja', 'Magnus', 'Ingrid', 'Emil', 'Astrid', 'Oskar', 'Sofie', 'Anders', 'Ida', 'Mads',
  'Lena', 'Felix', 'Hannah', 'Jonas', 'Clara', 'Maximilian', 'Marie', 'Paul', 'Elena', 'Luca',
  'Giulia', 'Marco', 'Lucía', 'Pablo', 'Valentina', 'Diego', 'Camila', 'Javier', 'Inès', 'Hugo',
  'Léa', 'Louis', 'Aisha', 'Omar', 'Fatima', 'Yusuf', 'Leila', 'Karim', 'Priya', 'Arjun',
  'Ananya', 'Rohan', 'Mei', 'Wei', 'Yuki', 'Haruto', 'Sakura', 'Min-jun', 'Ji-woo', 'Linh',
  'Minh', 'Amara', 'Kwame', 'Zara', 'Tariq', 'Nadia', 'Mikhail', 'Anya', 'Kofi', 'Imani',
  'Sebastian', 'Grace', 'Ethan', 'Lily', 'Ryan', 'Ella', 'Adam', 'Maya', 'Nathan', 'Ruby',
];

export const LAST_NAMES = [
  'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez',
  'Wilson', 'Anderson', 'Taylor', 'Thomas', 'Moore', 'Jackson', 'Martin', 'Lee', 'Thompson', 'White',
  'Harris', 'Clark', 'Lewis', 'Walker', 'Hall', 'Young', 'King', 'Wright', 'Scott', 'Green',
  'Nielsen', 'Jensen', 'Hansen', 'Pedersen', 'Andersen', 'Larsen', 'Johansson', 'Lindqvist', 'Berg', 'Holm',
  'Müller', 'Schmidt', 'Schneider', 'Fischer', 'Weber', 'Becker', 'Rossi', 'Russo', 'Ferrari', 'Bianchi',
  'Fernández', 'López', 'González', 'Pérez', 'Sánchez', 'Dubois', 'Laurent', 'Bernard', 'Moreau', 'Lefebvre',
  'Khan', 'Ahmed', 'Hassan', 'Ali', 'Patel', 'Sharma', 'Singh', 'Gupta', 'Chen', 'Wang',
  'Li', 'Zhang', 'Tanaka', 'Suzuki', 'Sato', 'Kim', 'Park', 'Nguyen', 'Tran', 'Okafor',
  'Mensah', 'Adeyemi', 'Ivanova', 'Petrov', 'Novak', 'Kowalski', 'Silva', 'Santos', 'Costa', 'Murphy',
];

export const CITIES: ReadonlyArray<readonly [string, string]> = [
  ['New York', 'United States'], ['Los Angeles', 'United States'], ['Chicago', 'United States'],
  ['Austin', 'United States'], ['Seattle', 'United States'], ['Toronto', 'Canada'], ['Vancouver', 'Canada'],
  ['Mexico City', 'Mexico'], ['São Paulo', 'Brazil'], ['Buenos Aires', 'Argentina'], ['Bogotá', 'Colombia'],
  ['London', 'United Kingdom'], ['Manchester', 'United Kingdom'], ['Dublin', 'Ireland'], ['Paris', 'France'],
  ['Lyon', 'France'], ['Berlin', 'Germany'], ['Munich', 'Germany'], ['Amsterdam', 'Netherlands'],
  ['Brussels', 'Belgium'], ['Copenhagen', 'Denmark'], ['Aarhus', 'Denmark'], ['Stockholm', 'Sweden'],
  ['Oslo', 'Norway'], ['Helsinki', 'Finland'], ['Madrid', 'Spain'], ['Barcelona', 'Spain'], ['Lisbon', 'Portugal'],
  ['Rome', 'Italy'], ['Milan', 'Italy'], ['Vienna', 'Austria'], ['Zurich', 'Switzerland'], ['Warsaw', 'Poland'],
  ['Prague', 'Czechia'], ['Athens', 'Greece'], ['Istanbul', 'Türkiye'], ['Cairo', 'Egypt'], ['Lagos', 'Nigeria'],
  ['Nairobi', 'Kenya'], ['Cape Town', 'South Africa'], ['Dubai', 'United Arab Emirates'], ['Mumbai', 'India'],
  ['Bengaluru', 'India'], ['Delhi', 'India'], ['Singapore', 'Singapore'], ['Bangkok', 'Thailand'],
  ['Jakarta', 'Indonesia'], ['Manila', 'Philippines'], ['Ho Chi Minh City', 'Vietnam'], ['Seoul', 'South Korea'],
  ['Tokyo', 'Japan'], ['Osaka', 'Japan'], ['Shanghai', 'China'], ['Hong Kong', 'China'], ['Sydney', 'Australia'],
  ['Melbourne', 'Australia'], ['Auckland', 'New Zealand'],
];

export const STREETS = [
  'Main St', 'Oak Ave', 'Maple Dr', 'Park Rd', 'Cedar Ln', 'Elm St', 'High St', 'Station Rd', 'Church St',
  'Mill Lane', 'River Rd', 'Lake View', 'Sunset Blvd', 'Market St', 'King St', 'Queen St', 'Hill Rd', 'Bridge St',
];

export const COMPANIES = [
  'Northwind Labs', 'Bluepeak Systems', 'Lumen Analytics', 'Harbor & Co', 'Cobalt Health', 'Fernway Studio',
  'Quanta Logistics', 'Brightline Media', 'Atlas Robotics', 'Greenfield Foods', 'Silverleaf Finance', 'Nimbus Cloud',
  'Orbit Education', 'Pinecrest Consulting', 'Redwood Retail', 'Stellar Energy', 'Tidewater Design', 'Vertex Biotech',
  'Willow Creative', 'Zephyr Mobility', 'Acme Corp', 'Juniper Networks Group', 'Keystone Legal', 'Meridian Travel',
];

export const JOB_TITLES = [
  'Software Engineer', 'Product Manager', 'Data Analyst', 'UX Designer', 'Marketing Manager', 'Sales Representative',
  'Teacher', 'Nurse', 'Accountant', 'Student', 'Project Coordinator', 'Customer Support Specialist', 'Consultant',
  'Operations Manager', 'Research Scientist', 'Graphic Designer', 'HR Specialist', 'Financial Advisor', 'Pharmacist',
  'Mechanical Engineer', 'Content Writer', 'Chef', 'Architect', 'Lawyer', 'Electrician', 'Business Owner',
];

export const SCHOOLS = [
  'Riverside High School', 'Lincoln Academy', 'Westbrook College', 'Northgate University', 'St. Mary\'s School',
  'Harbor View Institute', 'Maple Leaf Secondary', 'Central Polytechnic', 'Oakwood University', 'Greenhill Gymnasium',
];

export const EMAIL_DOMAINS = [
  'gmail.com', 'outlook.com', 'yahoo.com', 'icloud.com', 'proton.me', 'hotmail.com', 'example.com', 'mail.com',
];

export const LOREM = (
  'lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore ' +
  'magna aliqua enim ad minim veniam quis nostrud exercitation ullamco laboris nisi aliquip ex ea commodo consequat ' +
  'duis aute irure in reprehenderit voluptate velit esse cillum fugiat nulla pariatur excepteur sint occaecat ' +
  'cupidatat non proident sunt culpa qui officia deserunt mollit anim id est laborum'
).split(' ');

export const WORDS = [
  'service', 'quality', 'team', 'price', 'support', 'experience', 'process', 'design', 'speed', 'communication',
  'staff', 'product', 'value', 'website', 'app', 'delivery', 'event', 'course', 'schedule', 'content',
  'information', 'options', 'feedback', 'access', 'location', 'timing', 'organization', 'material', 'workshop', 'session',
];

/** Sentiment-aware free-text fragments for comment/feedback style questions. */
export const FEEDBACK = {
  positive: [
    'Really happy with the overall experience.',
    'Everything worked smoothly and the team was very helpful.',
    'Great value for the price, I would recommend it to friends.',
    'Clear communication and quick responses throughout.',
    'Exceeded my expectations, especially the {word}.',
    'The {word} was excellent and easy to use.',
    'Well organized and very professional.',
    'I enjoyed it a lot and would definitely do it again.',
    'Friendly staff and a really pleasant atmosphere.',
    'Very satisfied, keep up the good work!',
    'Loved the attention to detail.',
    'Fast, reliable and exactly what I needed.',
  ],
  neutral: [
    'It was fine overall, nothing special.',
    'Some parts were good, others could be improved.',
    'The {word} was okay but a bit inconsistent.',
    'Decent experience, although it took longer than expected.',
    'No major complaints, but there is room for improvement.',
    'Average. I might use it again depending on the {word}.',
    'It met my basic needs.',
    'Mixed feelings, the {word} was good but the {word2} less so.',
    'Not bad, but I expected a little more.',
    'Reasonable, though the instructions could be clearer.',
  ],
  negative: [
    'Disappointed with the {word}, it needs a lot of work.',
    'It took far too long and nobody kept me updated.',
    'Too expensive for what you get.',
    'The {word} was confusing and hard to use.',
    'Communication was poor and I had to follow up several times.',
    'Would not recommend in its current state.',
    'Several issues that were never resolved.',
    'Not what I expected at all, unfortunately.',
    'The {word} kept failing and support was slow to respond.',
    'Frustrating experience overall.',
  ],
  nothingToImprove: [
    'Nothing really, keep it up!',
    'Honestly nothing, it was great.',
    "Can't think of anything.",
    'Nothing comes to mind.',
    "Keep doing what you're doing.",
    'n/a, all good',
  ],
  suggestions: [
    'More flexible scheduling would help.',
    'Please improve the {word}.',
    'Clearer information up front would be useful.',
    'Faster response times would make a big difference.',
    'Consider adding more options for the {word}.',
    'A mobile-friendly version would be great.',
    'Better follow-up after the {word} would help.',
    'Shorter waiting times, please.',
    'More seating would be nice.',
    'Clearer signage and instructions.',
    'Offer a few more vegetarian options.',
    'Keep people updated when there are delays.',
    'Lower the prices a little.',
  ],
} as const;

export const SHORT_PHRASES = [
  'Yes', 'No', 'Maybe', 'Not sure', 'Sometimes', 'Often', 'Rarely', 'Depends', 'Definitely', 'N/A',
  'Good', 'Okay', 'Excellent', 'Could be better', 'Weekly', 'Daily', 'Monthly', 'Online', 'In person', 'Both',
];
