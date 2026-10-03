// A hand-written "loyal fans" crowd for the café survey, served to the extension
// in the video in place of a live Claude call. Answers are shaped by each person's mood.
const PEOPLE = [
  ['Margaret Ellis', 67, 'Retired teacher who comes in every morning for the quiet corner table', 0.92, 'Earl Grey', 'Walked past', ['Tea', 'Pastry'], "Honestly nothing. Maybe a few more cushions on the window bench.", 'This place is part of my morning routine. The staff remember my order, which I love.'],
  ['Mark Peterson', 41, 'Former regular who misses the old breakfast menu', 0.22, 'Filter coffee', 'Friend or family', ['Coffee', 'Breakfast'], 'Bring back the full breakfast. The new menu is too small.', 'Used to come every Sunday. Since the menu changed I come far less.'],
  ['Jonas Berg', 24, 'Nursing student who studies here between shifts', 0.8, 'Oat latte', 'Friend or family', ['Coffee', 'Pastry'], 'More power outlets near the tables, please.', 'Quiet enough to study and the coffee keeps me going through night shifts.'],
  ['Lucia Fernandez', 38, 'Young mum who brings her toddler on Saturdays', 0.86, 'Chai latte', 'Instagram', ['Tea', 'Breakfast', 'Pastry'], 'A small kids corner would be amazing.', 'Staff are always patient with my little one. That means a lot.'],
  ['Priya Nair', 31, 'Remote designer who works here twice a week and wants faster Wi-Fi', 0.62, 'Flat white', 'Google search', ['Coffee', 'Lunch'], "The Wi-Fi drops a lot in the afternoon. Fix that and I'd be here every day.", 'Great light and good coffee. Just the internet holding it back.'],
  ['Agnes Lindqvist', 59, 'Book club organiser who hosts monthly meetups here', 0.95, 'Pot of green tea', 'Local event', ['Tea', 'Pastry'], 'Nothing comes to mind.', "We've held our book club here for three years. Wouldn't go anywhere else."],
  ['Tom Okafor', 45, 'Long-time regular annoyed that oat milk now costs extra', 0.3, 'Cappuccino with oat milk', 'Walked past', ['Coffee'], 'Stop charging extra for oat milk. It adds up fast for regulars.', 'Still love the place but the recent price changes feel a bit much.'],
  ['Helen Murphy', 52, 'Office manager who orders catering for team meetings', 0.78, 'Americano', 'Google search', ['Coffee', 'Lunch'], 'Online ordering for catering would save me a phone call.', 'Our team loves the sandwiches. Reliable every time.'],
  ['Sofia Rossi', 27, 'Photographer who comes for the afternoon light', 0.84, 'Iced latte', 'Instagram', ['Coffee', 'Pastry'], 'Longer opening hours in summer.', 'Most photogenic cafe in town, and the cakes are lovely too.'],
  ['Ravi Shah', 29, 'Coffee nerd who judges every flat white', 0.55, 'Pour-over', 'Instagram', ['Coffee'], 'Dial in the espresso a bit, it was slightly bitter last week.', 'Good beans, the brewing just needs to be more consistent.'],
  ['Daniel Kim', 34, 'Commuter who grabs a takeaway on the way to the train', 0.7, 'Long black', 'Walked past', ['Coffee', 'Pastry'], 'A faster queue for takeaway orders in the morning rush.', 'Quick, friendly and the croissants are worth the detour.'],
  ['Eleanor Shaw', 71, 'Retired nurse who meets her friends here every Thursday', 0.9, 'Cappuccino', 'Walked past', ['Coffee', 'Pastry'], "Slightly bigger cups, if I'm being picky.", 'Lovely, warm staff. It feels like a second living room.'],
  ['Yusuf Demir', 22, 'Student on a tight budget who still treats himself every week', 0.58, 'Espresso', 'Friend or family', ['Coffee'], 'A student discount would be great.', 'Pricey for a student, but the quality is there.'],
  ['Carla Wright', 33, 'Comes for Sunday brunch with her partner', 0.8, 'Mocha', 'Friend or family', ['Coffee', 'Breakfast', 'Lunch'], 'Taking reservations for brunch would help.', 'Sunday brunch here is our little tradition.'],
  ['Kenji Watanabe', 36, 'Software engineer who takes calls from the back table', 0.5, 'Cortado', 'Google search', ['Coffee', 'Lunch'], 'It gets loud at lunchtime, hard to take calls.', 'Solid coffee, just busy around noon.'],
  ['Amara Okoye', 28, 'Fitness coach who stops by after morning classes', 0.74, 'Matcha latte', 'Instagram', ['Tea', 'Breakfast'], 'More high-protein breakfast options.', 'Friendly team and the matcha is the best around.'],
];

const moodWord = (m) => (m > 0.85 ? 'Delighted' : m > 0.7 ? 'Happy' : m > 0.5 ? 'Mostly happy' : m > 0.35 ? 'Mixed feelings' : 'Disappointed');
const pick = (list, m, jitter = 0) => list[Math.max(0, Math.min(list.length - 1, Math.round(m * (list.length - 1) + jitter)))];

function answersFor(p, i, schema) {
  const [name, age, , m, drink, heard, order, improve, comment] = p;
  const grid = ['Poor', 'Fair', 'Good', 'Excellent'];
  const known = {
    q10: name,
    q11: String(age),
    q12: heard,
    q13: `2026-09-${String(3 + ((i * 3) % 26)).padStart(2, '0')}`,
    q14: order,
    q15: String(Math.max(1, Math.min(5, Math.round(1 + m * 4)))),
    q16: { r1007: pick(grid, m, 0.2), r1008: pick(grid, m, 0.3), r1009: pick(grid, m, 0.4), r1010: pick(grid, m, -0.3) },
    q17: String(Math.max(0, Math.min(10, Math.round(m * 10 + 0.6 + (i % 3) * 0.5)))),
    q18: pick(['Strongly disagree', 'Disagree', 'Neutral', 'Agree', 'Strongly agree'], m, 0.15),
    q19: m > 0.6 ? 'Yes, sign me up' : 'No thanks',
    q20: `+45 ${20 + i} ${String(31 + i * 7).padStart(2, '0')} ${String(10 + i * 3).padStart(2, '0')} ${String(40 + i).padStart(2, '0')}`,
    q21: drink,
    q22: improve,
    q23: comment,
  };
  const out = {};
  for (const [key, s] of Object.entries(schema.properties)) out[key] = key in known ? known[key] : s.enum ? s.enum[0] : '';
  return out;
}

/** Reply to one AI crowd request, using the schema the extension sent. */
export function crowdReply(body, offset) {
  const schema = body.output_config.format.schema.properties.respondents.items;
  const n = Number(/Write (\d+) respondents/.exec(body.messages[0].content)?.[1] ?? 8);
  const respondents = Array.from({ length: n }, (_, k) => {
    const i = (offset + k) % PEOPLE.length;
    const p = PEOPLE[i];
    return {
      persona: `${p[2]}. ${moodWord(p[3])}.`,
      ...(schema.properties.email ? { email: `${p[0].toLowerCase().replace(/[^a-z]+/g, '.')}@example.com` } : {}),
      answers: answersFor(p, i, schema.properties.answers),
    };
  });
  return {
    id: `msg_video_${offset}`,
    type: 'message',
    role: 'assistant',
    model: body.model,
    content: [{ type: 'text', text: JSON.stringify({ respondents }) }],
    stop_reason: 'end_turn',
    stop_sequence: null,
    usage: { input_tokens: 900, output_tokens: 1800 },
  };
}
