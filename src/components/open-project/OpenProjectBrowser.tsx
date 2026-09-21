"use client";

import type { ProjectCollectionEntry } from "@/src/lib/animation/unifiedProjectCollection";
import type { BootstrapResult } from "@/src/lib/animation/unifiedWorkspaceBootstrap";
import { ProjectLibrary } from "../project-library/ProjectLibrary";

type Props = {
  onBack: () => void;
  onOpenProject: (entry: ProjectCollectionEntry) => Promise<BootstrapResult>;
};

export function OpenProjectBrowser({ onBack, onOpenProject }: Props) {
  return <ProjectLibrary surface="edit" onBack={onBack} onOpenProject={onOpenProject} />;
}
