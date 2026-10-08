export interface GuideItem {
  href: string;
  title: string;
  kicker: string;
  description: string;
  image: string;
  imageAlt: string;
  width: number;
  height: number;
}

// Every published guide. Add a new guide here and it appears on the homepage,
// the Guides page, and in each guide's related links automatically.
export const GUIDES: GuideItem[] = [
  {
    href: "/guides/word-hunt-tips",
    title: "How to Win at Word Hunt: Tips and Strategy",
    kicker: "Strategy",
    description:
      "Scoring math, a scanning routine, ways to build longer words, and two real boards we solved, with every word counted.",
    image: "/images/word-hunt-tips.webp",
    imageAlt: "A 4x4 Word Hunt board with the path for STRAINED traced across 8 tiles, next to three quick tips",
    width: 1200,
    height: 720,
  },
  {
    href: "/guides/word-hunt-cheat",
    title: "Word Hunt Cheat Guide: Fair Ways to Find More Words",
    kicker: "Fair Play",
    description:
      "When a solver is fair, how people cheat, and a cheat sheet of prefixes, suffixes, and short words you can use without any tool.",
    image: "/images/word-hunt-cheat.webp",
    imageAlt: "A pigeon in a winter hat pointing at a word grid on a tablet while holding a cheat sheet",
    width: 1024,
    height: 1024,
  },
  {
    href: "/guides/word-hunt-solver-vs-word-finder",
    title: "Word Hunt Solver vs Word Finder vs Word Search Solver",
    kicker: "Word Tools",
    description:
      "Which word tool fits which puzzle, why Word Hunt isn't a word search, and how it compares with Boggle.",
    image: "/images/word-hunt-vs-word-search-vs-word-finder.webp",
    imageAlt: "Three puzzles side by side: a Word Hunt grid with a bent path, a word search with a straight line, and loose letters for a word finder",
    width: 1200,
    height: 700,
  },
];

export interface ToolItem {
  href: string;
  title: string;
  description: string;
  cta: string;
  icon: "grid" | "chart";
}

export const TOOLS: ToolItem[] = [
  {
    href: "/",
    title: "Word Hunt Solver",
    description:
      "Type or upload your board and see every word with its points and swipe path. Works on boards from 3x3 to 6x6.",
    cta: "Open the solver",
    icon: "grid",
  },
  {
    href: "/evolver",
    title: "Board Evolver",
    description:
      "Builds high scoring practice boards, so you can train on boards packed with long words.",
    cta: "Build a practice board",
    icon: "chart",
  },
];
