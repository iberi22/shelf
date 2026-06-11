// seedGenerator.ts - Generate recovery seed phrases

// BIP39-inspired word list (simplified, 256 words for 12-word seeds)
const WORD_LIST = [
  'abandon',
  'ability',
  'able',
  'about',
  'above',
  'absent',
  'absorb',
  'abstract',
  'absurd',
  'abuse',
  'access',
  'accident',
  'account',
  'accuse',
  'achieve',
  'acid',
  'acoustic',
  'acquire',
  'across',
  'act',
  'action',
  'actor',
  'actress',
  'actual',
  'adapt',
  'add',
  'addict',
  'address',
  'adjust',
  'admit',
  'adult',
  'advance',
  'advice',
  'aerobic',
  'affair',
  'afford',
  'afraid',
  'again',
  'age',
  'agent',
  'agree',
  'ahead',
  'aim',
  'air',
  'airport',
  'aisle',
  'alarm',
  'album',
  'alcohol',
  'alert',
  'alien',
  'all',
  'alley',
  'allow',
  'almost',
  'alone',
  'alpha',
  'already',
  'also',
  'alter',
  'always',
  'amateur',
  'amazing',
  'among',
  'amount',
  'amused',
  'analyst',
  'anchor',
  'ancient',
  'anger',
  'angle',
  'angry',
  'animal',
  'ankle',
  'announce',
  'annual',
  'another',
  'answer',
  'antenna',
  'antique',
  'anxiety',
  'any',
  'apart',
  'apology',
  'appear',
  'apple',
  'approve',
  'april',
  'arch',
  'arctic',
  'area',
  'arena',
  'argue',
  'arm',
  'armed',
  'armor',
  'army',
  'around',
  'arrange',
  'arrest',
  'arrive',
  'arrow',
  'art',
  'artefact',
  'artist',
  'artwork',
  'ask',
  'aspect',
  'assault',
  'asset',
  'assist',
  'assume',
  'asthma',
  'athlete',
  'atom',
  'attack',
  'attend',
  'attitude',
  'attract',
  'auction',
  'audit',
  'august',
  'aunt',
  'author',
  'auto',
  'autumn',
  'average',
  'avocado',
  'avoid',
  'awake',
  'aware',
  'away',
  'awesome',
  'awful',
  'awkward',
  'axis',
  'baby',
  'bachelor',
  'bacon',
  'badge',
  'bag',
  'balance',
  'balcony',
  'ball',
  'bamboo',
  'banana',
  'banner',
  'bar',
  'barely',
  'bargain',
  'barrel',
  'base',
  'basic',
  'basket',
  'battle',
  'beach',
  'bean',
  'beauty',
  'because',
  'become',
  'beef',
  'before',
  'begin',
  'behave',
  'behind',
  'believe',
  'below',
  'belt',
  'bench',
  'benefit',
  'best',
  'betray',
  'better',
  'between',
  'beyond',
  'bicycle',
  'bid',
  'bike',
  'bind',
  'biology',
  'bird',
  'birth',
  'bitter',
  'black',
  'blade',
  'blame',
  'blanket',
  'blast',
  'bleak',
  'bless',
  'blind',
  'blood',
  'blossom',
  'blouse',
  'blue',
  'blur',
  'blush',
  'board',
  'boat',
  'body',
  'boil',
  'bomb',
  'bone',
  'bonus',
  'book',
  'boost',
  'border',
  'boring',
  'borrow',
  'boss',
  'bottom',
  'bounce',
  'box',
  'boy',
  'bracket',
  'brain',
  'brand',
  'brass',
  'brave',
  'bread',
  'breeze',
  'brick',
  'bridge',
  'brief',
  'bright',
  'bring',
  'brisk',
  'broccoli',
  'broken',
  'bronze',
  'broom',
  'brother',
  'brown',
  'brush',
  'bubble',
  'buddy',
  'budget',
  'buffalo',
  'build',
  'bulb',
  'bulk',
  'bullet',
  'bundle',
  'bunker',
  'burden',
  'burger',
  'burst',
  'bus',
  'business',
  'busy',
  'butter',
  'buyer',
  'buzz',
];

/**
 * Generate a random recovery seed phrase
 * @param wordCount - Number of words in seed (12 or 24)
 * @returns Array of seed words
 */
export function generateSeed(wordCount: 12 | 24 = 12): string[] {
  const seed: string[] = [];

  for (let i = 0; i < wordCount; i++) {
    const randomIndex = crypto.getRandomValues(new Uint8Array(1))[0] % WORD_LIST.length;
    seed.push(WORD_LIST[randomIndex]);
  }

  return seed;
}

/**
 * Validate a seed phrase
 * @param seed - Array of seed words
 * @returns True if all words are valid
 */
export function validateSeed(seed: string[]): boolean {
  if (seed.length !== 12 && seed.length !== 24) {
    return false;
  }

  return seed.every((word) => WORD_LIST.includes(word.toLowerCase()));
}

/**
 * Convert seed array to string
 * @param seed - Array of seed words
 * @returns Space-separated seed string
 */
export function seedToString(seed: string[]): string {
  return seed.join(' ');
}

/**
 * Convert seed string to array
 * @param seedString - Space-separated seed string
 * @returns Array of seed words
 */
export function stringToSeed(seedString: string): string[] {
  return seedString
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter((word) => word.length > 0);
}

/**
 * Get the full word list (for autocomplete, etc.)
 * @returns Array of all valid seed words
 */
export function getWordList(): string[] {
  return [...WORD_LIST];
}
