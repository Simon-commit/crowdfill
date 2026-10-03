// A realistic demo form ("café customer survey") in Google's FB_PUBLIC_LOAD_DATA_
// format. Served to the extension by the e2e suite instead of hitting Google.
const N = null;
const opt = (label, nav = N) => [label, N, nav, N, 0];
const other = () => ['', N, N, N, 1];
const col = (label) => [label];

export const SHOWCASE_ID = '1FAIpQLSdShowcaseCafeSurveyxxxxxxxxxxxxxxxxxxxxxxxxx';
export const SHOWCASE_URL = `https://docs.google.com/forms/d/e/${SHOWCASE_ID}/viewform`;

const grid = (entry, row) => [entry, [col('Poor'), col('Fair'), col('Good'), col('Excellent')], 1, [row], N, N, N, N, N, N, N, [0]];

export const SHOWCASE_DATA = [
  N,
  [
    'Thanks for visiting Riverside Café! This takes about two minutes.',
    [
      [10, 'Full name', N, 0, [[1001, N, 1]]],
      [11, 'Age', N, 0, [[1002, N, 0, N, [[1, 7, ['16', '99'], 'Please enter an age between 16 and 99']]]]],
      [12, 'How did you hear about us?', N, 3, [[1003, [opt('Friend or family'), opt('Instagram'), opt('Google search'), opt('Walked past'), opt('Local event')], 1]]],
      [13, 'Date of your visit', N, 9, [[1004, N, 1, N, N, N, N, [0, 1]]]],
      [14, 'What did you order?', N, 4, [[1005, [opt('Coffee'), opt('Tea'), opt('Pastry'), opt('Breakfast'), opt('Lunch'), other()], 1]]],
      [15, 'Overall, how satisfied were you?', N, 5, [[1006, [col('1'), col('2'), col('3'), col('4'), col('5')], 1, ['Very dissatisfied', 'Very satisfied']]]],
      [16, 'Rate the following', N, 7, [grid(1007, 'Food'), grid(1008, 'Service'), grid(1009, 'Atmosphere'), grid(1010, 'Value for money')]],
      [17, 'How likely are you to recommend us to a friend?', N, 5, [[1011, Array.from({ length: 11 }, (_, i) => col(String(i))), 1, ['Not at all likely', 'Extremely likely']]]],
      [18, 'The staff were friendly and helpful', N, 2, [[1012, [opt('Strongly disagree'), opt('Disagree'), opt('Neutral'), opt('Agree'), opt('Strongly agree')], 1]]],
      [19, 'Would you like to join our loyalty program?', N, 2, [[1013, [opt('Yes, sign me up', 200), opt('No thanks', 201)], 1]]],
      [200, 'Loyalty program', "We'll text you a welcome reward.", 8, N, N],
      [20, 'Phone number', N, 0, [[1014, N, 1]]],
      [21, 'Favourite drink', N, 0, [[1015, N, 0]]],
      [201, 'Anything else?', N, 8, N, N],
      [22, 'What could we improve?', N, 1, [[1016, N, 0]]],
      [23, 'Any other comments?', N, 1, [[1017, N, 0, N, [[6, 202, ['300'], 'Max 300 characters']]]]],
    ],
    N, N, N, N, N, N,
    'Riverside Café Customer Survey',
    73,
    [N, N, N, 2, N, N, 3],
  ],
  '/forms',
  'Riverside Café Customer Survey',
  N, N, N, '', N, 0, 0, N, '', 0,
  `e/${SHOWCASE_ID}`,
  0, '[]', 0, 0, 1,
];

export function showcaseHtml() {
  return `<!doctype html><html><head><title>Riverside Café Customer Survey</title></head><body>
<form action="https://docs.google.com/forms/d/e/${SHOWCASE_ID}/formResponse" method="POST">
<input type="hidden" name="fvv" value="1"><input type="hidden" name="pageHistory" value="0">
<input type="hidden" name="fbzx" value="-4815162342108"></form>
<script type="text/javascript">var FB_PUBLIC_LOAD_DATA_ = ${JSON.stringify(SHOWCASE_DATA)};</script></body></html>`;
}
