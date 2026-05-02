const fs = require("fs");

function read(file) {
  return fs.readFileSync(file, "utf8");
}

function write(file, content) {
  fs.writeFileSync(file, content, "utf8");
}

function replaceOrThrow(content, find, replace, label) {
  if (!content.includes(find)) {
    throw new Error(`Could not find: ${label}`);
  }
  return content.replace(find, replace);
}

/* 1) Fix source JS logic */
{
  const file = "src/js/app/03-marks-links-library.js";
  let s = read(file);

  s = s.replace(
    /function parseMark\(value\)\s*{\s*return parseGradeValue\(value\);\s*}/,
    `function parseMark(value, system = getGradingSystem()) {
  return parseGradeValue(value, system);
}`
  );

  if (!s.includes("function isModulePredictionMode(")) {
    s = replaceOrThrow(
      s,
      `// Converts a raw weighted percentage (0–100) to the native grade-point value for non-UK systems.`,
      `function isModulePredictionMode(mod, system = getGradingSystem()) {
  if (system === "uk") return false;
  const cwWeight = Number(mod?.cw) || 0;
  const examWeight = Number(mod?.exam) || 0;
  return cwWeight > 0 || examWeight > 0;
}

// Converts a raw weighted percentage (0–100) to the native grade-point value for non-UK systems.`,
      "insert isModulePredictionMode helper"
    );
  }

  s = s.replace(
    `if (mod.usesCwExamPrediction) {`,
    `if (isModulePredictionMode(mod, system)) {`
  );

  s = s.replace(
    `: parseMark(store.exams?.[mi]);`,
    `: parseMark(store.exams?.[mi], getComponentMarkSystem());`
  );

  s = s.replace(
    `const isPredictionMode = getGradingSystem() !== "uk" && mod?.usesCwExamPrediction === true;`,
    `const isPredictionMode = isModulePredictionMode(mod);`
  );

  s = s.replace(
    `if (predictionToggle) predictionToggle.checked = mod.usesCwExamPrediction === true;`,
    `if (predictionToggle) predictionToggle.checked = isModulePredictionMode(mod);`
  );

  s = s.replace(
    `if (getGradingSystem() === "uk" || mod.usesCwExamPrediction) syncModuleWeightInputs("cw");`,
    `if (getGradingSystem() === "uk" || isModulePredictionMode(mod)) syncModuleWeightInputs("cw");`
  );

  write(file, s);
}

/* 2) Fix module card render switch */
{
  const file = "src/js/app/08-module-rendering.js";
  let s = read(file);

  s = replaceOrThrow(
    s,
    `const isPredictionMode = gradingSystem !== "uk" && mod.usesCwExamPrediction === true;`,
    `const isPredictionMode = isModulePredictionMode(mod, gradingSystem);`,
    "08-module-rendering isPredictionMode"
  );

  write(file, s);
}

/* 3) Fix tiny readable text without broad overrides */
{
  const file = "src/styles/app/03-library-topics.css";
  let s = read(file);

  s = s.replace(
    /\.coursework-calc-summary\s*{\s*font-family:\s*"DM Mono", monospace;\s*font-size:\s*10px;\s*color:\s*var\(--muted\);\s*margin-bottom:\s*10px;\s*}/,
    `.topic-list .coursework-calc-summary {
  font-family: "DM Mono", monospace;
  font-size: 12px;
  line-height: 1.45;
  color: var(--muted);
  margin-bottom: 12px;
}`
  );

  if (!s.includes(".topic-list .checkbox-label")) {
    s = s.replace(
      `.coursework-component-delete { height: 32px; align-self: end; }`,
      `.coursework-component-delete { height: 32px; align-self: end; }

.topic-list .checkbox-label,
.topic-list .module-major-toggle {
  font-size: 13px;
  line-height: 1.45;
}

.topic-list .module-major-toggle input[type="checkbox"] {
  width: 14px;
  height: 14px;
}`
    );
  }

  write(file, s);
}

console.log("Fixed non-UK CW/exam prediction parsing + readability CSS.");
