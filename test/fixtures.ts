/**
 * Synthetic `FB_PUBLIC_LOAD_DATA_` covering every question type, validation
 * rules, "Other" options, grids, e-mail collection and section branching.
 * The shape mirrors real Google Forms payloads.
 */
const N = null;
const opt = (label: string, nav: number | null = null) => [label, N, nav, N, 0];
const other = () => ['', N, N, N, 1];
const col = (label: string) => [label];

export const FORM_ID = '1FAIpQLSfTESTFORMxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';

export const KITCHEN_SINK: unknown[] = [
  N,
  [
    'A form exercising every question type',
    [
      [100, 'Your name', N, 0, [[1001, N, 1]], N, N, N, N, N, N, [N, 'Your name']],
      [101, 'Contact e-mail', N, 0, [[1011, N, 0, N, [[2, 102, [], 'Must be an e-mail']]]]],
      [102, 'How old are you?', N, 0, [[1021, N, 1, N, [[1, 7, ['18', '65'], 'Between 18 and 65']]]]],
      [103, 'Student code', N, 0, [[1031, N, 1, N, [[4, 301, ['[A-Z]{2}\\d{4}'], 'Format AA0000']]]]],
      [104, 'Tell us more', N, 1, [[1041, N, 0, N, [[6, 202, ['40'], 'Max 40 characters']]]]],
      [105, 'Favourite colour', N, 2, [[1051, [opt('Red'), opt('Green'), opt('Blue'), other()], 1]]],
      [106, 'Country', N, 3, [[1061, [opt('Denmark'), opt('Norway'), opt('Sweden')], 1]]],
      [107, 'Toppings', N, 4, [[1071, [opt('Cheese'), opt('Ham'), opt('Olives'), opt('Pineapple'), other()], 1, N, [[7, 200, ['2'], 'Pick at least two']]]]],
      [108, 'How satisfied are you?', N, 5, [[1081, [col('1'), col('2'), col('3'), col('4'), col('5')], 1, ['Not at all', 'Very']]]],
      [109, 'I would recommend this', N, 2, [[1091, [opt('Strongly disagree'), opt('Disagree'), opt('Neutral'), opt('Agree'), opt('Strongly agree')], 0]]],
      [
        110,
        'Rate the parts',
        N,
        7,
        [
          [1101, [col('Poor'), col('Fair'), col('Good'), col('Excellent')], 1, ['Food'], N, N, N, N, N, N, N, [0]],
          [1102, [col('Poor'), col('Fair'), col('Good'), col('Excellent')], 1, ['Service'], N, N, N, N, N, N, N, [0]],
        ],
      ],
      [
        111,
        'Which days suit you?',
        N,
        7,
        [
          [1111, [col('Mon'), col('Tue'), col('Wed')], 0, ['Morning'], N, N, N, N, N, N, N, [1]],
          [1112, [col('Mon'), col('Tue'), col('Wed')], 0, ['Evening'], N, N, N, N, N, N, N, [1]],
        ],
      ],
      [112, 'Birthday', N, 9, [[1121, N, 1, N, N, N, N, [0, 1]]]],
      [113, 'Appointment', N, 9, [[1131, N, 0, N, N, N, N, [1, 0]]]],
      [114, 'Wake-up time', N, 10, [[1141, N, 1, N, N, N, [0]]]],
      [115, 'Run duration', N, 10, [[1151, N, 0, N, N, N, [1]]]],
      [116, 'Continue to the extra questions?', N, 2, [[1161, [opt('Yes, continue', 300), opt('No, finish', -3)], 1]]],
      [117, 'A picture', N, 11, N],
      [300, 'Extra section', 'Only for some respondents', 8, N, N],
      [118, 'Upload your CV', N, 13, [[1181, N, 0]]],
      [119, 'Stars', N, 18, [[1191, [col('1'), col('2'), col('3'), col('4'), col('5')], 0]]],
      [301, 'Final section', N, 8, N, -2],
      [120, 'Anything else?', N, 1, [[1201, N, 0]]],
    ],
    N,
    N,
    N,
    N,
    N,
    N,
    'Kitchen sink',
    73,
    [N, N, N, 2, N, N, 3],
  ],
  '/forms',
  'Kitchen sink (file)',
  N,
  N,
  N,
  '',
  N,
  0,
  0,
  N,
  '',
  0,
  `e/${FORM_ID}`,
  0,
  '[]',
  0,
  0,
  1,
];

export function kitchenSinkHtml(): string {
  return `<!doctype html><html><body><form action="https://docs.google.com/forms/d/e/${FORM_ID}/formResponse" method="POST">
<input type="hidden" name="fbzx" value="-1234567890123456789"><input type="hidden" name="pageHistory" value="0"></form>
<script type="text/javascript" nonce="x">var FB_PUBLIC_LOAD_DATA_ = ${JSON.stringify(KITCHEN_SINK)};</script></body></html>`;
}
