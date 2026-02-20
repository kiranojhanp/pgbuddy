const proc = Bun.spawn(["bun", "test", "--coverage", "--coverage-reporter=lcov"], {
  stdout: "inherit",
  stderr: "inherit",
});

const exitCode = await proc.exited;
if (exitCode !== 0) {
  process.exit(exitCode);
}

const lcovPath = "coverage/lcov.info";
const lcovFile = Bun.file(lcovPath);
if (!(await lcovFile.exists())) {
  console.error(`Coverage file not found: ${lcovPath}`);
  process.exit(1);
}

const text = await lcovFile.text();

let lf = 0;
let lh = 0;
let fnf = 0;
let fnh = 0;
let brf = 0;
let brh = 0;

let currentFile: string | null = null;
let includeCurrent = false;

const normalizePath = (filePath: string) => filePath.replace(/\\/g, "/");

const shouldInclude = (filePath: string) => {
  const normalized = normalizePath(filePath);
  if (normalized.includes("/node_modules/")) return false;
  return normalized.includes("/src/") || normalized.startsWith("src/");
};

const addTotals = (key: string, value: number) => {
  if (!includeCurrent) return;
  if (key === "LF") lf += value;
  if (key === "LH") lh += value;
  if (key === "FNF") fnf += value;
  if (key === "FNH") fnh += value;
  if (key === "BRF") brf += value;
  if (key === "BRH") brh += value;
};

for (const line of text.split("\n")) {
  if (line.startsWith("SF:")) {
    currentFile = line.slice(3).trim();
    includeCurrent = currentFile.length > 0 && shouldInclude(currentFile);
    continue;
  }

  if (line.startsWith("LF:")) addTotals("LF", Number(line.slice(3)));
  if (line.startsWith("LH:")) addTotals("LH", Number(line.slice(3)));
  if (line.startsWith("FNF:")) addTotals("FNF", Number(line.slice(4)));
  if (line.startsWith("FNH:")) addTotals("FNH", Number(line.slice(4)));
  if (line.startsWith("BRF:")) addTotals("BRF", Number(line.slice(4)));
  if (line.startsWith("BRH:")) addTotals("BRH", Number(line.slice(4)));
}

if (lf === 0 && fnf === 0 && brf === 0) {
  console.error("Coverage failure: no matching src/* files in lcov report.");
  process.exit(1);
}

if (lf !== lh || fnf !== fnh || brf !== brh) {
  console.error(
    `Coverage failure: lines ${lh}/${lf}, functions ${fnh}/${fnf}, branches ${brh}/${brf}`
  );
  process.exit(1);
}

console.log(
  `Coverage OK: lines ${lh}/${lf}, functions ${fnh}/${fnf}, branches ${brh}/${brf}`
);
