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

for (const line of text.split("\n")) {
  if (line.startsWith("LF:")) lf += Number(line.slice(3));
  if (line.startsWith("LH:")) lh += Number(line.slice(3));
  if (line.startsWith("FNF:")) fnf += Number(line.slice(4));
  if (line.startsWith("FNH:")) fnh += Number(line.slice(4));
  if (line.startsWith("BRF:")) brf += Number(line.slice(4));
  if (line.startsWith("BRH:")) brh += Number(line.slice(4));
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
