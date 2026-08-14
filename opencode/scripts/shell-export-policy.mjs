const SAFE_DECISION = Object.freeze({ blocked: false, rule: null });

export const SHELL_EXPORT_RULES = Object.freeze({
  ENVIRONMENT_ENUMERATION: "shell-export-environment-enumeration",
  SENSITIVE_NAME: "shell-export-sensitive-name",
  SECRET_SOURCE: "shell-export-secret-source",
});

const SECRET_NAME_SUFFIXES = [
  "API_KEY",
  "TOKEN",
  "SECRET",
  "PASSWORD",
  "CREDENTIALS",
  "PRIVATE_KEY",
  "COOKIE",
  "AUTH_TOKEN",
];

const SECRET_READERS = new Set([
  "aws",
  "cat",
  "curl",
  "env",
  "gcloud",
  "op",
  "pass",
  "printenv",
  "security",
  "vault",
  "wget",
]);

const VARIABLE_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

function decision(rule) {
  return { blocked: true, rule };
}

function isSensitiveName(name) {
  const normalized = String(name).toUpperCase();
  return SECRET_NAME_SUFFIXES.some(
    (suffix) => normalized === suffix || normalized.endsWith(`_${suffix}`),
  );
}

function splitShellCommands(command) {
  const segments = [];
  let start = 0;
  let quote = null;
  let escaped = false;
  let comment = false;

  for (let index = 0; index < command.length; index += 1) {
    const character = command[index];

    if (comment) {
      if (character === "\n") {
        start = index + 1;
        comment = false;
      }
      continue;
    }

    if (escaped) {
      escaped = false;
      continue;
    }

    if (character === "\\" && quote !== "'") {
      escaped = true;
      continue;
    }

    if (quote) {
      if (character === quote) quote = null;
      continue;
    }

    if (character === "'" || character === '"' || character === "`") {
      quote = character;
      continue;
    }

    if (character === "#" && (index === 0 || /\s/.test(command[index - 1]))) {
      segments.push(command.slice(start, index));
      start = index + 1;
      comment = true;
      continue;
    }

    if (character === ";" || character === "|" || character === "&" || character === "\n") {
      segments.push(command.slice(start, index));
      if ((character === "|" || character === "&") && command[index + 1] === character) {
        index += 1;
      }
      start = index + 1;
    }
  }

  if (!comment) segments.push(command.slice(start));
  return segments;
}

function tokenizeShellWords(text) {
  const words = [];
  let word = "";
  let quote = null;
  let escaped = false;

  const push = () => {
    if (word) words.push(word);
    word = "";
  };

  for (const character of text) {
    if (escaped) {
      word += character;
      escaped = false;
      continue;
    }

    if (character === "\\" && quote !== "'") {
      escaped = true;
      continue;
    }

    if (quote) {
      if (character === quote) {
        quote = null;
      } else {
        word += character;
      }
      continue;
    }

    if (character === "'" || character === '"' || character === "`") {
      quote = character;
      word += character;
      continue;
    }

    if (/\s/.test(character)) {
      push();
      continue;
    }

    word += character;
  }

  if (escaped) word += "\\";
  push();
  return words;
}

function exportCommandFromSegment(segment) {
  let remaining = segment.trim();

  while (true) {
    const keyword = remaining.match(/^(?:then|do|else|elif)\s+/);
    if (!keyword) break;
    remaining = remaining.slice(keyword[0].length).trimStart();
  }

  const match = remaining.match(/^export(?:\s+|$)/);
  if (!match) return null;
  return remaining.slice(match[0].length).trim();
}

function stripSingleQuotedText(value) {
  let result = "";
  let quote = null;

  for (const character of value) {
    if (quote === "'") {
      if (character === "'") quote = null;
      continue;
    }
    if (character === "'") {
      quote = "'";
      continue;
    }
    result += character;
  }

  return result;
}

function containsSensitiveEnvironmentReference(value) {
  const unquoted = stripSingleQuotedText(value);
  const references = unquoted.matchAll(/\$\{?([A-Za-z_][A-Za-z0-9_]*)\}?/g);
  for (const reference of references) {
    if (isSensitiveName(reference[1])) return true;
  }
  return false;
}

function containsSecretReaderSubstitution(value) {
  const unquoted = stripSingleQuotedText(value);
  const substitutions = [
    ...unquoted.matchAll(/\$\(([^()]*)\)/g),
    ...unquoted.matchAll(/`([^`]*)`/g),
  ];

  for (const substitution of substitutions) {
    const body = substitution[1];
    const firstCommand = body.trim().match(/^([A-Za-z][A-Za-z0-9_-]*)\b/);
    if (firstCommand && SECRET_READERS.has(firstCommand[1].toLowerCase())) return true;
    if (/(?:;|\|\||&&|\|)\s*([A-Za-z][A-Za-z0-9_-]*)\b/.test(body)) {
      const nestedCommands = body.matchAll(/(?:;|\|\||&&|\|)\s*([A-Za-z][A-Za-z0-9_-]*)\b/g);
      for (const nested of nestedCommands) {
        if (SECRET_READERS.has(nested[1].toLowerCase())) return true;
      }
    }
  }

  return false;
}

function classifyExportArguments(argumentsText) {
  const words = tokenizeShellWords(argumentsText);
  if (words.length === 0 || words.includes("-p")) {
    return decision(SHELL_EXPORT_RULES.ENVIRONMENT_ENUMERATION);
  }

  const assignments = [];
  const exportedNames = [];
  for (const word of words) {
    if (word.startsWith("-")) continue;
    const equalsIndex = word.indexOf("=");
    if (equalsIndex === -1) {
      if (VARIABLE_RE.test(word)) exportedNames.push(word);
      continue;
    }

    const name = word.slice(0, equalsIndex);
    if (VARIABLE_RE.test(name)) {
      exportedNames.push(name);
      assignments.push(word.slice(equalsIndex + 1));
    }
  }

  if (exportedNames.some(isSensitiveName)) {
    return decision(SHELL_EXPORT_RULES.SENSITIVE_NAME);
  }

  if (
    assignments.some(
      (value) =>
        containsSensitiveEnvironmentReference(value) ||
        containsSecretReaderSubstitution(value),
    )
  ) {
    return decision(SHELL_EXPORT_RULES.SECRET_SOURCE);
  }

  return SAFE_DECISION;
}

export function classifyShellExport(command) {
  if (typeof command !== "string" || command.length === 0) return SAFE_DECISION;

  for (const segment of splitShellCommands(command)) {
    const argumentsText = exportCommandFromSegment(segment);
    if (argumentsText === null) continue;

    const decisionForSegment = classifyExportArguments(argumentsText);
    if (decisionForSegment.blocked) return decisionForSegment;
  }

  return SAFE_DECISION;
}
