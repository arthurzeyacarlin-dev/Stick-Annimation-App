export const TUTORIAL_STATUS = "COMING LATER" as const;

export const TUTORIAL_CARDS = [
  {id: "start-here", title: "Start Here", featured: true, description: "Tour the app in two minutes"},
  {id: "first-animation", title: "Create Your First Animation", featured: false, description: "Draw, add frames, and press play"},
  {id: "create-with-ai", title: "Create with AI", featured: false, description: "Let the AI help you animate"},
  {id: "finalize-animation", title: "Finalize Your Animation", featured: false, description: "Polish it and export a video"},
] as const;

export type TutorialCard = (typeof TUTORIAL_CARDS)[number];
