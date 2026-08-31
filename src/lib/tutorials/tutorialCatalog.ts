export const TUTORIAL_STATUS = "COMING LATER" as const;

export const TUTORIAL_CARDS = [
  {id: "start-here", title: "Start Here", featured: true},
  {id: "first-animation", title: "Create Your First Animation", featured: false},
  {id: "create-with-ai", title: "Create with AI", featured: false},
  {id: "finalize-animation", title: "Finalize Your Animation", featured: false},
] as const;

export type TutorialCard = (typeof TUTORIAL_CARDS)[number];
