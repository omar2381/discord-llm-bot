/**
 * Seven-way rock-paper-scissors.
 *
 * The choices, the verbs and the descriptions are adapted from Discord's
 * discord-example-app (Copyright (c) 2022 Shay DeWael, MIT), kept in
 * reference/rps-rules-discord-example-app.js. Everything else here is new:
 * the shuffle is unbiased, the result shape is plain data, and formatting is
 * separate from deciding.
 */

/**
 * Who each choice beats, and the verb for it. Every choice beats exactly three
 * others, so the table is balanced: 7 choices x 3 wins = 21 ordered pairs, with
 * 7 ties and 21 losses making up the 49.
 */
export const RULES = Object.freeze({
  rock: { virus: 'outwaits', computer: 'smashes', scissors: 'crushes' },
  cowboy: { scissors: 'puts away', wumpus: 'lassos', rock: 'steel-toe kicks' },
  scissors: { paper: 'cuts', computer: 'cuts cord of', virus: 'cuts DNA of' },
  virus: { cowboy: 'infects', computer: 'corrupts', wumpus: 'infects' },
  computer: {
    cowboy: 'overwhelms',
    paper: 'uninstalls firmware for',
    wumpus: 'deletes assets for',
  },
  wumpus: {
    paper: 'draws picture on',
    rock: 'paints cute face on',
    scissors: 'admires own reflection in',
  },
  paper: { virus: 'ignores', cowboy: 'gives papercut to', rock: 'covers' },
});

export const DESCRIPTIONS = Object.freeze({
  rock: 'sedimentary, igneous, or perhaps even metamorphic',
  cowboy: 'yeehaw~',
  scissors: 'careful ! sharp ! edges !!',
  virus: 'genetic mutation, malware, or something inbetween',
  computer: 'beep boop beep bzzrrhggggg',
  wumpus: 'the purple Discord fella',
  paper: 'versatile and iconic',
});

export const CHOICES = Object.freeze(Object.keys(RULES));

/** Decide a round. Returns who won and the verb describing it. */
export function getResult(p1, p2) {
  if (!RULES[p1]) throw new Error(`unknown choice: ${p1}`);
  if (!RULES[p2]) throw new Error(`unknown choice: ${p2}`);

  if (RULES[p1][p2]) return { outcome: 'p1', verb: RULES[p1][p2] };
  if (RULES[p2][p1]) return { outcome: 'p2', verb: RULES[p2][p1] };
  return { outcome: 'tie', verb: 'tie' };
}

/** Render a decided round as the message posted in the channel. */
export function formatResult({ outcome, verb }, p1, p2) {
  if (outcome === 'tie') {
    return `<@${p1.id}> and <@${p2.id}> both chose **${p1.choice}**. Draw.`;
  }
  const [win, lose] = outcome === 'p1' ? [p1, p2] : [p2, p1];
  return `<@${win.id}>'s **${win.choice}** ${verb} <@${lose.id}>'s **${lose.choice}**`;
}

/** Fisher-Yates. The sort(() => Math.random() - 0.5) it replaces was biased. */
export function shuffle(items, random = Math.random) {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Choices as select-menu options, in a random order each time. */
export function choiceOptions(random = Math.random) {
  return shuffle(CHOICES, random).map((choice) => ({
    label: choice[0].toUpperCase() + choice.slice(1),
    value: choice,
    description: DESCRIPTIONS[choice],
  }));
}
