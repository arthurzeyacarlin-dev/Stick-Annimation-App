export const collapseTimelineRange = <Frame>(
  frames: readonly Frame[],
  removeStartIndex: number,
  removeEndIndex: number,
  createEmptyFrame: () => Frame,
) => {
  if (removeEndIndex < removeStartIndex) {
    return {
      frames: frames.slice(),
      removedFrameCount: 0,
    };
  }

  const nextFrames = frames.slice();
  const removedFrameCount = removeEndIndex - removeStartIndex + 1;
  nextFrames.splice(removeStartIndex, removedFrameCount);

  for (let index = 0; index < removedFrameCount; index += 1) {
    nextFrames.push(createEmptyFrame());
  }

  return {
    frames: nextFrames,
    removedFrameCount,
  };
};
