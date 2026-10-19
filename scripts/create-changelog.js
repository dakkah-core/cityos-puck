const path = require("path");
const fs = require("fs");

const releasePattern = /^#\s(\[?(([0-9]|\.)+)\]?.*)((.|\n)*)/gm;

const transform = (body) =>
  body.replace(releasePattern, (_, header, _2, _3, content) => {
    return `## ${header}${content}`;
  });

const changelogPath = path.join(__dirname, "../CHANGELOG.md");
const changelog = fs.readFileSync(changelogPath, "utf8");

let changes = "";

async function updateChangelog() {
  const { StandardChangelog } = await import("standard-changelog");
  const generator = new StandardChangelog(path.join(__dirname, ".."))
    .readPackage()
    .readRepository();
  for await (const chunk of generator.write()) {
    changes += chunk;
  }
  // Indent headers and add download section
  const transformed = transform(changes);

  // Inject into changelog
  const updatedChangelog = changelog.replace(
    "<!--__CHANGELOG_ENTRY__-->\n",
    `<!--__CHANGELOG_ENTRY__-->\n\n${transformed}`
  );

  fs.writeFileSync(changelogPath, updatedChangelog);
}

updateChangelog().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
