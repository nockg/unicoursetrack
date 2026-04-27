/* Topic drag/drop, reordering, nesting and subtopic movement entry points */

  if (!topics || fromIndex < 0 || toIndex < 0 || fromIndex >= topics.length || toIndex >= topics.length) return;
  if (fromIndex === toIndex && placement === "before") return;
  const [moved] = topics.splice(fromIndex, 1);
  let insertIndex = toIndex;
  if (fromIndex < toIndex) insertIndex -= 1;
  if (placement === "after") insertIndex += 1;
  insertIndex = Math.max(0, Math.min(topics.length, insertIndex));
  topics.splice(insertIndex, 0, moved);
  remapTopicStateForReorder(mi, fromIndex, insertIndex);
  refreshTopicStructure(mi);
}

async function nestTopicUnderTopic(mi, sourceIndex, parentIndex) {
  const topics = MODULES[mi]?.topics;
  if (!topics || sourceIndex === parentIndex || sourceIndex < 0 || parentIndex < 0 || sourceIndex >= topics.length || parentIndex >= topics.length) return;
  const sourceTopic = getTopicEntry(mi, sourceIndex);
  if (sourceTopic.subtopics.length) {
    await showAppNotice("Drag a simpler topic", "Only plain topics can be nested right now. Move or clear that topic's own subtopics first.");
    return;
  }

  const stateSnapshot = getModuleTopicStateSnapshot(mi);
  const sourceState = stateSnapshot[sourceIndex];
  const [movedTopic] = topics.splice(sourceIndex, 1);
  stateSnapshot.splice(sourceIndex, 1);

  let nextParentIndex = parentIndex;
  if (sourceIndex < parentIndex) nextParentIndex -= 1;

  const parentTopic = getTopicEntry(mi, nextParentIndex);
  topics[nextParentIndex] = Object.assign({}, parentTopic, {
    subtopics: [...parentTopic.subtopics, movedTopic.title],
    collapsed: false
  });

  const parentState = stateSnapshot[nextParentIndex] || { main: false, subs: [] };
  parentState.subs = [...parentState.subs, !!sourceState?.main];
  parentState.main = parentState.main && parentState.subs.every(Boolean);
  stateSnapshot[nextParentIndex] = parentState;

  applyModuleTopicStateSnapshot(mi, stateSnapshot);
  refreshTopicStructure(mi);
}

function startTopicReorder(mi, ti, event, si = null) {
  draggedTopic = { kind: si === null ? "main" : "sub", mi, ti, si, startX: draggedTopicStartX || event.clientX || 0 };
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", `${mi}:${ti}:${si === null ? "main" : si}`);
}

function allowTopicDrop(mi, ti, event) {
  if (!draggedTopic || draggedTopic.mi !== mi) return;
  event.preventDefault();
  const indentDelta = (event.clientX || 0) - (draggedTopic.startX || 0);
  const rect = event.currentTarget.getBoundingClientRect();
  const dropAfter = (event.clientY || rect.top) > rect.top + (rect.height / 2);
  if (draggedTopic.kind === "sub") {
    document.querySelectorAll(".topic-row.drop-before, .topic-row.drop-after, .topic-row.drop-subtopic").forEach((row) => {
      if (row !== event.currentTarget) row.classList.remove("drop-before", "drop-after", "drop-subtopic");
    });
    event.currentTarget.classList.remove("reordering", "drop-before", "drop-after", "drop-subtopic");
    if (indentDelta > 34) event.currentTarget.classList.add("drop-subtopic");
    else event.currentTarget.classList.add(dropAfter ? "drop-after" : "drop-before");
    return;
  }
  const canNestBeforeTarget = indentDelta > 34 && !dropAfter && ti > 0;
  const canNestInPlace = indentDelta > 34 && draggedTopic.ti === ti && ti > 0;
  const canNestAfterParent = indentDelta > 34 && dropAfter && draggedTopic.ti !== ti;
  document.querySelectorAll(".topic-row.drop-before, .topic-row.drop-after, .topic-row.drop-subtopic").forEach((row) => {
    if (row !== event.currentTarget) row.classList.remove("drop-before", "drop-after", "drop-subtopic");
  });
  event.currentTarget.classList.remove("reordering", "drop-before", "drop-after", "drop-subtopic");
  if (canNestBeforeTarget || canNestInPlace || canNestAfterParent) {
    event.currentTarget.classList.add("drop-subtopic");
  } else {
    event.currentTarget.classList.add(dropAfter ? "drop-after" : "drop-before");
  }
}

function clearTopicDropState(event) {
  event.currentTarget.classList.remove("reordering", "drop-before", "drop-after", "drop-subtopic");
}

function dropTopicReorder(mi, ti, event) {
  event.preventDefault();
  topicDropSuppressUntil = Date.now() + 650;
  event.currentTarget.classList.remove("reordering", "drop-before", "drop-after", "drop-subtopic");
  if (!draggedTopic || draggedTopic.mi !== mi) return;
  const indentDelta = (event.clientX || 0) - (draggedTopic.startX || 0);
  const rect = event.currentTarget.getBoundingClientRect();
  const dropAfter = (event.clientY || rect.top) > rect.top + (rect.height / 2);
  if (draggedTopic.kind === "sub") {
    if (indentDelta > 34) moveSubtopicToParent(mi, draggedTopic.ti, draggedTopic.si, ti);
    else promoteSubtopicToMain(mi, draggedTopic.ti, draggedTopic.si, ti, dropAfter ? "after" : "before");
    draggedTopic = null;
    draggedTopicStartX = 0;
    return;
  }
  const canNestBeforeTarget = indentDelta > 34 && !dropAfter && ti > 0;
  const canNestInPlace = indentDelta > 34 && draggedTopic.ti === ti && ti > 0;
  const canNestAfterParent = indentDelta > 34 && dropAfter && draggedTopic.ti !== ti;
  if (canNestBeforeTarget || canNestInPlace || canNestAfterParent) {
    const parentIndex = canNestAfterParent ? ti : ti - 1;
    nestTopicUnderTopic(mi, draggedTopic.ti, parentIndex);
    draggedTopic = null;
    draggedTopicStartX = 0;
    return;
  }
  moveTopicInModule(mi, draggedTopic.ti, ti, dropAfter ? "after" : "before");
  draggedTopic = null;
  draggedTopicStartX = 0;
}

function endTopicReorder() {
  topicDropSuppressUntil = Math.max(topicDropSuppressUntil, Date.now() + 250);
  draggedTopic = null;
  draggedTopicStartX = 0;
  document.querySelectorAll(".topic-row.reordering, .topic-row.drop-before, .topic-row.drop-after, .topic-row.drop-subtopic").forEach((row) => row.classList.remove("reordering", "drop-before", "drop-after", "drop-subtopic"));
}

function allowSubtopicDrop(mi, parentTi, si, event) {
  if (!draggedTopic || draggedTopic.mi !== mi) return;
  if (draggedTopic.kind === "sub" && draggedTopic.ti === parentTi && draggedTopic.si === si) return;
  event.preventDefault();
  const rect = event.currentTarget.getBoundingClientRect();
  const dropAfter = (event.clientY || rect.top) > rect.top + (rect.height / 2);
  document.querySelectorAll(".topic-row.drop-before, .topic-row.drop-after, .topic-row.drop-subtopic").forEach((row) => {
    if (row !== event.currentTarget) row.classList.remove("drop-before", "drop-after", "drop-subtopic");
  });
  event.currentTarget.classList.remove("reordering", "drop-before", "drop-after", "drop-subtopic");
  if (draggedTopic.kind === "sub") {
    event.currentTarget.classList.add(dropAfter ? "drop-after" : "drop-before");
  }
}

function dropSubtopicReorder(mi, parentTi, si, event) {
  event.preventDefault();
  topicDropSuppressUntil = Date.now() + 650;
  event.currentTarget.classList.remove("reordering", "drop-before", "drop-after", "drop-subtopic");
  if (!draggedTopic || draggedTopic.mi !== mi) return;
  const rect = event.currentTarget.getBoundingClientRect();
  const dropAfter = (event.clientY || rect.top) > rect.top + (rect.height / 2);
  if (draggedTopic.kind === "sub") {
    moveSubtopicInModule(mi, draggedTopic.ti, draggedTopic.si, parentTi, si, dropAfter ? "after" : "before");
  }
  draggedTopic = null;
  draggedTopicStartX = 0;
}


const DEADLINE_PRIORITY_COLOURS = {
  high: "#b84a3f",
