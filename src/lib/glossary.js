/**
 * Original interpretive text shared by the app's detail panel and the SEO
 * pages. All phrasing here is our own (Ra Uru Hu's prose is Jovian Archive
 * IP — see docs/RESEARCH.md §3.1); names, numbers and structure are free.
 * Pure data, no DOM — safe to import from the Worker and from node tests.
 */

// Original generic line themes (the gate pages carry the specific 384; these
// describe the universal quality, used on profile pages).
export const LINE_THEMES = {
  1: { name: 'Investigator', text: 'The foundation. You build security by studying, understanding and getting to the bottom of things before you act — and others come to rely on the depth you lay down.' },
  2: { name: 'Hermit', text: 'The natural. You carry an innate gift others often see before you do; it flowers in your own quiet time and resists being summoned on demand.' },
  3: { name: 'Martyr', text: 'Trial and error. You learn by doing — bumping into what does not work and adapting — resilient, experimental and wise to whatever actually holds up.' },
  4: { name: 'Opportunist', text: 'The networker. Your opportunities travel through relationships and trusted bonds; warmth and friendship, not cold pursuit, open the right doors.' },
  5: { name: 'Heretic', text: 'The projected one. People project practical, universal solutions onto you; meet the moment and you are trusted as a leader, fall short and the same hope can sour — reputation matters.' },
  6: { name: 'Role Model', text: 'The example. You live in three phases — a trial-and-error youth, a withdrawn observing middle, then a trusted, objective exemplar others measure themselves against.' }
};

// Brief original "how to live it" guidance per type (keeps type pages from
// being thin).
export const TYPE_GUIDANCE = {
  manifestor: 'Manifestors are here to initiate and get things moving. Your power comes from acting on your own urges rather than waiting — and from informing the people your actions affect, which dissolves the resistance that otherwise meets you. When you honour that, life feels peaceful; when you suppress it, anger.',
  generator: 'Generators are the life force of the world, built to do work they love. Your power is not in chasing but in responding — letting things come to you and noticing the gut pull toward yes or no. Work that lights you up is sustainable; forcing what doesn\'t leads to frustration and burnout.',
  manifestingGenerator: 'Manifesting Generators respond like a Generator and then move fast, often skipping steps and juggling several things at once. Your path is rarely linear, and that is by design. Respond first, then inform before you leap, and trust the multi-passionate route — frustration and anger both signal you have got ahead of your response.',
  projector: 'Projectors are the guides, here to see and direct energy rather than generate it. Your gift lands when it is recognised and invited — pushing in uninvited meets resistance and exhaustion. Master what fascinates you, manage your energy, and wait for the right invitations; success feels like recognition, not hustle.',
  reflector: 'Reflectors are rare mirrors of their community, sampling the energy around them. You are deeply affected by where you are and who you are with, so environment is everything. Give big decisions a full lunar cycle before committing — clarity comes over time, not on demand — and a true life feels like delight.'
};


// Original circuit descriptions (the engine's keywords are terse).
export const CIRCUIT_DESC = {
  individual: 'The Individual circuit is the energy of mutation and uniqueness — the drive to be yourself, follow your own knowing, and bring something genuinely new into the world. It empowers through difference, and its melancholy is the doorway to creative breakthrough. This is the current of the artist, the rebel, the one who can\'t help being authentic; it moves in pulses, not on demand.',
  tribal: 'The Tribal circuit is the energy of support, family and resources — bargains, loyalty, and taking care of your own. It builds and sustains community through agreements and material security. Its concern is survival and continuity: who is provided for, who can be relied on, and what is promised. Tribal energy is emotional and touch-based, felt rather than reasoned.',
  collective: 'The Collective circuit is the energy of sharing — patterns, logic and experience offered to all of humanity. It runs in two streams: the Logic stream, which tests what works and builds reliable, repeatable systems, and the Sensing (abstract) stream, which makes meaning out of lived experience. This is how humanity learns, plans and evolves together.',
  integration: 'The Integration circuit is the energy of self-empowerment and survival — a tight cluster of channels linking the Self, Throat, Spleen and Sacral, focused on the individual thriving in the moment. It is the most self-referential current in the design: spontaneous, instinctive and quick, here to empower the self first so that it can then empower the collective.'
};

// Canonical HD planet-column order (Nodes before Moon), glyphs and names.
export const PLANET_ORDER = [
  'sun', 'earth', 'northNode', 'southNode', 'moon', 'mercury',
  'venus', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'pluto'
];

export const PLANET_GLYPHS = {
  sun: '☉', earth: '⊕', moon: '☽', northNode: '☊', southNode: '☋',
  mercury: '☿', venus: '♀', mars: '♂', jupiter: '♃', saturn: '♄',
  uranus: '♅', neptune: '♆', pluto: '♇'
};

export const PLANET_NAMES = {
  sun: 'Sun', earth: 'Earth', moon: 'Moon', northNode: 'North Node',
  southNode: 'South Node', mercury: 'Mercury', venus: 'Venus', mars: 'Mars',
  jupiter: 'Jupiter', saturn: 'Saturn', uranus: 'Uranus', neptune: 'Neptune',
  pluto: 'Pluto'
};

// What each planet colors in a gate it activates.
export const PLANET_TEXT = {
  sun: 'The light you shine. The Sun carries the largest share of your energy, so the gate it sits in is a theme people meet in you first.',
  earth: 'What keeps you steady. Earth always sits opposite the Sun and shows where you find your footing when life pulls you around.',
  northNode: 'The road ahead. The North Node colors the environments and themes that open up in the second half of life.',
  southNode: 'The road behind. The South Node colors the places and themes that shaped you in the first half of life.',
  moon: 'What moves you. The Moon describes the drive underneath your choices, the thing you keep returning to.',
  mercury: 'What you\'re here to say. Mercury shows the kind of thought you most want to put into words.',
  venus: 'Your values. Venus shows what you care about getting right, and where your sense of fairness lives.',
  mars: 'Where you grow up. Mars marks an area of immature, restless energy that matures through experience.',
  jupiter: 'Where you are protected. Jupiter shows the principle that brings you good fortune when you honor it.',
  saturn: 'Where you are tested. Saturn shows the principle that brings consequences when you ignore it.',
  uranus: 'Where you are unusual. Uranus marks a theme you approach in your own unexpected way.',
  neptune: 'Where things blur. Neptune shows a theme that is hard to see clearly but quietly shapes you.',
  pluto: 'Where you meet deep truth. Pluto marks a slow, transforming theme that works on you over a lifetime.'
};

export const SIDE_TEXT = {
  design: 'Design (red) is calculated about 88 days before birth. It describes body-level themes you live without thinking about them; others often see them in you more clearly than you do.',
  personality: 'Personality (black) is the moment of birth. It describes the themes you recognise as yourself, the ones you can name and reflect on.'
};

// The three layers under every line. Advanced detail — kept short.
export const SUBSTRUCTURE_TEXT = {
  color: 'Color (1–6) is the motivation and style under the line.',
  tone: 'Tone (1–6) is the sense you take in the world through.',
  base: 'Base (1–5) is the most fundamental layer, how this energy is grounded in the body.'
};

// Keyed by the engine's authority name.
export const AUTHORITY_TEXT = {
  'Emotional Authority': 'Your feelings move in a wave, rising and falling over hours or days. No single moment holds the whole truth, so clarity arrives once you have felt a decision from several places on that wave. Sleep on it; the calm that settles in later is your answer.',
  'Sacral Authority': 'Your gut answers before your mind does, often as a sound or a felt pull toward or away. That immediate response, in the moment, is trustworthy. Questions with a yes-or-no shape help it speak.',
  'Splenic Authority': 'Your body knows in an instant, quietly, and only once. The first faint sense of rightness or unease is the signal; it won\'t repeat itself or argue its case. Trust it in the moment.',
  'Ego/Heart Authority': 'Your willpower speaks for you. Notice what you genuinely want and what you are willing to promise; when you hear yourself say "I want" or "I will" and mean it, that is your guide.',
  'Self-Projected Authority': 'Your truth becomes clear as you hear yourself talk. Speak decisions out loud to people you trust, without asking for their advice, and listen to what your own voice tells you about direction.',
  'Mental/Environment': 'You have no inner authority in the body; clarity comes through the right surroundings and the right sounding boards. Talk things through in different places with people you trust, then notice what feels correct.',
  'Lunar Authority': 'You sample everything around you, so clarity takes a full cycle of the Moon, about 28 days. Give big decisions that time, talk them over, and see what stays consistent as the month turns.'
};

// Keyed by the engine's definition string.
export const DEFINITION_TEXT = {
  'No Definition': 'No centers are defined, so everything you meet passes through you. You read the people and places around you with rare clarity, and you need to choose them carefully.',
  'Single Definition': 'All of your defined centers connect into one continuous flow. You tend to process on your own and feel complete in yourself.',
  'Split Definition': 'Your defined centers form two separate areas. You may feel drawn to people who bridge the gap, and sometimes need a little time or company to bring both halves together.',
  'Triple Split Definition': 'Your defined centers form three separate areas. You do well moving between many people and places; time in public spaces helps you connect your own pieces.',
  'Quadruple Split Definition': 'Your defined centers form four separate areas. This rare configuration processes slowly and steadily; allow plenty of time before settling on a direction.'
};

export const DEFINED_TEXT = {
  defined: 'A defined center is colored in. Its energy is consistent: you carry it all the time, and others feel it from you.',
  undefined: 'An undefined center is white but has at least one active gate. You take this energy in from others and from the world, and you can become wise about it.',
  open: 'An open center is white with no active gates at all. It is completely open to whatever comes in, which makes it a place of deep learning.'
};

// Variable: the four arrows. Keyed by the engine's slot name.
export const VARIABLE_TEXT = {
  determination: { label: 'Determination', sub: 'How your body takes in nourishment', text: 'The Design Sun\'s color and tone describe the conditions under which your body digests well. Treat it as an experiment, not a rule.' },
  environment: { label: 'Environment', sub: 'Where you thrive', text: 'The Design Node\'s color describes the kind of place where your body feels right and your clarity comes easily.' },
  perspective: { label: 'Perspective', sub: 'How your mind sees', text: 'The Personality Node\'s color describes what your mind naturally notices and the angle it takes on things.' },
  motivation: { label: 'Motivation', sub: 'What moves you', text: 'The Personality Sun\'s color describes the underlying reason you do what you do, the drive beneath your choices.' }
};

export const ARROW_TEXT = {
  left: 'Left-facing arrows are focused and strategic: active, specific, and good at concentrating on what matters.',
  right: 'Right-facing arrows are receptive and peripheral: they take in the whole field and work best without forcing.'
};

export const CROSS_TEXT = 'Your Incarnation Cross is formed by the gates of your Personality and Design Sun and Earth. Together they carry most of the chart\'s energy and describe a life theme that unfolds over time, not a task to complete.';

export const ANGLE_TEXT = {
  'Right Angle': 'A Right Angle cross is personal: your path is your own, and it unfolds through your own experience.',
  'Left Angle': 'A Left Angle cross is transpersonal: your path unfolds through the people you meet and the bonds you form.',
  'Juxtaposition': 'A Juxtaposition cross is fixed: a steady, particular path that stays true to itself.'
};

// Connection: the four ways two charts share a channel.
export const CONNECTION_TYPES = {
  electromagnetic: { label: 'Electromagnetic', color: 'var(--electromagnetic)', text: 'Each of you carries one half of a channel — together you complete it, generating energy neither has alone. This is the spark of attraction, and the friction that rides along with it.' },
  companionship: { label: 'Companionship', color: 'var(--integration)', text: 'You both already have the whole channel — shared, stable common ground where you simply “get” each other with no effort.' },
  compromise: { label: 'Compromise', color: 'var(--collective)', text: 'One of you has the full channel, the other only half of it. The full-channel person sets the tone here; the other gets drawn into their frequency — workable, but it asks for give and take.' },
  dominance: { label: 'Dominance', color: 'var(--text-tertiary)', text: 'One of you has the full channel and the other has nothing in it. That energy flows one way, consistently conditioning the open person — powerful, and worth being conscious of.' }
};

export const PENTA_TEXT = 'A Penta is the small-group form of a team, three to five people. Each defined center someone brings fills a role the group needs; roles nobody fills show where the group leans on outside help.';
