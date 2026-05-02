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
    /function parseMark\(value(?:,\s*system\s*=\s*getGradingSystem\(\))?\)\s*{\s*return parseGradeValue\(value(?:,\s*system)?\);\s*}/,
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
  return mod?.usesCwExamPrediction === true || cwWeight > 0 || examWeight > 0;
}

// Converts a raw weighted percentage (0–100) to the native grade-point value for non-UK systems.`,
      "insert isModulePredictionMode helper"
    );
  } else {
    s = s.replace(
      /function isModulePredictionMode\(mod,\s*system\s*=\s*getGradingSystem\(\)\)\s*{[\s\S]*?return[\s\S]*?;\s*}/,
      `function isModulePredictionMode(mod, system = getGradingSystem()) {
  if (system === "uk") return false;
  const cwWeight = Number(mod?.cw) || 0;
  const examWeight = Number(mod?.exam) || 0;
  return mod?.usesCwExamPrediction === true || cwWeight > 0 || examWeight > 0;
}`
    );
  }

  s = s.replaceAll(
    `if (mod.usesCwExamPrediction) {`,
    `if (isModulePredictionMode(mod, system)) {`
  );

  s = s.replaceAll(
    `parseMark(store.exams?.[mi])`,
    `parseMark(store.exams?.[mi], getComponentMarkSystem())`
  );

  s = s.replaceAll(
    `parseMark(store.coursework?.[mi])`,
    `parseMark(store.coursework?.[mi], getComponentMarkSystem())`
  );

  s = s.replaceAll(
    `const isPredictionMode = getGradingSystem() !== "uk" && mod?.usesCwExamPrediction === true;`,
    `const isPredictionMode = isModulePredictionMode(mod);`
  );

  s = s.replaceAll(
    `if (predictionToggle) predictionToggle.checked = mod.usesCwExamPrediction === true;`,
    `if (predictionToggle) predictionToggle.checked = isModulePredictionMode(mod);`
  );

  s = s.replaceAll(
    `if (getGradingSystem() === "uk" || mod.usesCwExamPrediction) syncModuleWeightInputs("cw");`,
    `if (getGradingSystem() === "uk" || isModulePredictionMode(mod)) syncModuleWeightInputs("cw");`
  );

  const oldPredictionMarks = `const cwMark = isDeScale
          ? parseGradeValue(store.coursework?.[mi], "de5")
          : parseMark(store.coursework?.[mi], getComponentMarkSystem());
        const examMark = isDeScale
          ? parseGradeValue(store.exams?.[mi], "de5")
          : parseMark(store.exams?.[mi], getComponentMarkSystem());`;

  const newPredictionMarks = `const calculatedCoursework = calculateCourseworkFromComponents(mi);
        const cwMark = calculatedCoursework.mark !== null
          ? calculatedCoursework.mark
          : (isDeScale
              ? parseGradeValue(store.coursework?.[mi], "de5")
              : parseMark(store.coursework?.[mi], getComponentMarkSystem()));
        const examMark = isDeScale
          ? parseGradeValue(store.exams?.[mi], "de5")
          : parseMark(store.exams?.[mi], getComponentMarkSystem());`;

  s = replaceOrThrow(
    s,
    oldPredictionMarks,
    newPredictionMarks,
    "prediction cw/exam parsing block"
  );

  const oldComponentSync = `// For UK, component marks are rolled up into the CW field so getModuleFinal can use them.
  // For non-UK, getModuleFinal reads components directly (DE) or they are informational (others).
  if (getGradingSystem() === "uk") {`;

  const newComponentSync = `// Component rows roll up into the CW field for UK and for non-UK prediction mode.
  // Non-UK transcript-only modules keep components informational.
  if (getGradingSystem() === "uk" || isModulePredictionMode(MODULES[mi])) {`;

  s = replaceOrThrow(
    s,
    oldComponentSync,
    newComponentSync,
    "updateCourseworkComponent sync condition"
  );

  s = s.replace(
    `if (getGradingSystem() === "uk") {
    const calculated = calculateCourseworkFromComponents(mi);
    if (calculated.mark !== null) getStore().coursework[mi] = formatGradeInputValue(calculated.mark);
  }`,
    `if (getGradingSystem() === "uk" || isModulePredictionMode(MODULES[mi])) {
    const calculated = calculateCourseworkFromComponents(mi);
    if (calculated.mark !== null) getStore().coursework[mi] = formatGradeInputValue(calculated.mark);
  }`
  );

  s = s.replace(
    /function updateCourseworkSummary\(mi\) \{[\s\S]*?\n\}\n\nfunction commitCourseworkPlaceholder/,
    `function updateCourseworkSummary(mi) {
  const summary = document.getElementById(\`cw-calc-summary-\${mi}\`);
  if (!summary) return;

  const system = getGradingSystem();
  const mod = MODULES[mi];
  const calculated = calculateCourseworkFromComponents(mi);
  const manual = parseMark(getStore().coursework[mi], getComponentMarkSystem());
  const predictionMode = isModulePredictionMode(mod);

  if (system === "uk" || predictionMode) {
    if (calculated.mark !== null) {
      const main = system === "de5" ? \`\${calculated.mark.toFixed(1)} grade\` : \`\${calculated.mark.toFixed(1)}%\`;
      summary.textContent = \`Calculated coursework: \${main} — components override manual coursework input\`;
      return;
    }
    if (manual !== null) {
      const main = system === "de5" ? \`\${manual.toFixed(1)} grade\` : \`\${manual.toFixed(1)}%\`;
      summary.textContent = \`Manual coursework input: \${main}\`;
      return;
    }
    summary.textContent = \`Enter an overall coursework mark above, or let this calculator build it from your assessments.\`;
    return;
  }

  if (calculated.mark !== null) {
    summary.textContent = \`Calculated average: \${calculated.mark.toFixed(1)}% — informational only because prediction is not enabled.\`;
    return;
  }

  summary.textContent = \`Track individual assessment marks here, or enable mark prediction in Module Options to use them in the estimate.\`;
}

function commitCourseworkPlaceholder`
  );

  write(file, s);
}

/* 2) Fix module card render switch */
{
  const file = "src/js/app/08-module-rendering.js";
  let s = read(file);

  s = s.replaceAll(
    `const isPredictionMode = gradingSystem !== "uk" && mod.usesCwExamPrediction === true;`,
    `const isPredictionMode = isModulePredictionMode(mod, gradingSystem);`
  );

  write(file, s);
}

/* 3) Fix module assessment text readability */
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

/* 4) Fix module form hint/checkbox tiny text */
{
  const file = "src/styles/app/09-modal-forms.css";
  let s = read(file);

  s = s.replace(
    `.field-hint {
  font-size: 11px;
  line-height: 1.5;
  color: var(--muted);
  margin-top: 2px;
}`,
    `.field-hint {
  font-size: 13px;
  line-height: 1.55;
  color: var(--muted);
  margin-top: 2px;
}`
  );

  s = s.replace(
    `.checkbox-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  letter-spacing: 0.04em;
}`,
    `.checkbox-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  line-height: 1.45;
  font-weight: 600;
  cursor: pointer;
  letter-spacing: 0.02em;
}`
  );

  write(file, s);
}

console.log("Fixed non-UK prediction v2: component rows sync to CW, estimates calculate, and tiny text is readable.");
