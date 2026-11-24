// Secret formats the F1.25 independent review found slipping through redact().
// Every fake secret is assembled at runtime so the repo never stores a key-shaped string.
import { describe, expect, it } from "vitest";
import { redact } from "../src/redact.js";

const AWS_SECRET = ["wJalrXUtnFEMI", "K7MDENG", "bPxRfiCYFAKE0KEY1234"].join("/");
const PASSWORD = ["S3cret", "Pass9"].join("");
const SLACK_HOOK = ["https://hooks.slack.com/services", "T0FAKE01", "B0FAKE02", "aB3dE5fG7h"].join(
  "/",
);
const BEARER = ["fk", "9Qw2Er4Ty6Ui8Op"].join("");

const LEAKS: readonly [string, string, string][] = [
  ["aws credentials file", `aws_secret_access_key = ${AWS_SECRET}`, AWS_SECRET],
  ["aws cli JSON output", `{"SecretAccessKey": "${AWS_SECRET}"}`, AWS_SECRET],
  ["JSON inside a string", `{\\"api_key\\":\\"${PASSWORD}xx\\"}`, `${PASSWORD}xx`],
  ["short name db_pass", `db_pass=${PASSWORD}`, PASSWORD],
  ["credential name", `"credential": "${PASSWORD}xx"`, `${PASSWORD}xx`],
  ["private key id", `"private_key_id": "0a1b2c3d4e5f60718293a4b5c6d7e8f9"`, "0a1b2c3d4e5f6071"],
  ["mysql -p", `mysql -u root -p${PASSWORD} app`, PASSWORD],
  ["curl -u", `curl -u admin:${PASSWORD} https://api.example.com`, PASSWORD],
  ["short bearer token", `Authorization: Bearer ${BEARER}`, BEARER],
  ["slack webhook", `curl -X POST ${SLACK_HOOK}`, "aB3dE5fG7h"],
  ["aws key id after _", `x_${["AKIA", "FAKE1234567890AB"].join("")}`, "FAKE1234567890AB"],
  ["zero-width space inside a key", `sk-${"FAKEproj​a1b2c3d4e5f6g7h8"}`, "a1b2c3d4e5f6g7h8"],
];

describe("redact catches the formats the review found", () => {
  it.each(LEAKS)("hides the secret in: %s", (_, text, secret) => {
    const result = redact(text);

    expect(result.text).not.toContain(secret);
    expect(result.count).toBeGreaterThanOrEqual(1);
  });

  it("keeps JSON escapes intact around a hidden value", () => {
    expect(redact(`{\\"api_key\\":\\"${PASSWORD}xx\\"}`).text).toBe(
      '{\\"api_key\\":\\"••••••••\\"}',
    );
  });
});

const STILL_BENIGN: readonly string[] = [
  "mkdir -p dist/web",
  "passengers = 12",
  "Bearer authentication is described in RFC 6750.",
  "PWD=/home/dev2/project",
  "git log --format=%H -n 1",
];

describe("the new rules leave ordinary text alone", () => {
  it.each(STILL_BENIGN)("%s", (text) => {
    expect(redact(text)).toMatchObject({ text, count: 0 });
  });
});

describe("redact stays fast on hostile input", () => {
  it.each(["KEY".repeat(40_000), "a_secret".repeat(15_000), "mysql ".repeat(20_000)])(
    "finishes 100+ KB quickly",
    (text) => {
      const started = performance.now();
      redact(text);

      expect(performance.now() - started).toBeLessThan(500);
    },
  );
});
