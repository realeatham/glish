// 3 connected subgraphs
// within each part, letters are connected together
import * as util from "util";
import { progress } from "./util";

// there are multiple edges
export type SonorityGraph = {
  // onset, nucleus, coda
  parts: [SonorityGraphPart, SonorityGraphPart, SonorityGraphPart];
};

const STOP = undefined;
const START = undefined;
// letter -> [nextLetter | STOP, count]
// note: letter may not be in this graph part. if not, look at next graph part.
// undefined as next letter means stop
// undefined as letter (key in map) means start. (only for onset)
// undefined -> [undefined, count] means how often this graph part is skipped (no onset)
export type SonorityGraphPart = Map<
  string | typeof START,
  Array<[string | typeof STOP, number]>
>;

// onset -> pre-vowel consonants
// nucleus -> vowel (or syllabic consonants like m in rhythm)
// coda -> post-vowel consonants

export function createSonorityGraph(
  syllablizedPronuncations: Array<[string, Array<Array<string>>]>
): SonorityGraph {
  const graph: SonorityGraph = {
    parts: [new Map(), new Map(), new Map()],
  };

  let i = 0;
  for (const [word, syllables] of syllablizedPronuncations) {
    progress(i, syllablizedPronuncations.length, "");
    i += 1;
    for (const syllable of syllables) {
      //   console.log("syllable: ", syllable);
      const [onsetPart, nucleusPart, codaPart] = splitIntoChunks(syllable);
      //   console.log(" > chunks: ", [onsetPart, nucleusPart, codaPart]);
      updateGraphPart("onset", graph.parts[0], onsetPart, nucleusPart?.[0]);
      updateGraphPart("nucleus", graph.parts[1], nucleusPart, codaPart?.[0]);
      updateGraphPart("coda", graph.parts[2], codaPart, STOP);
    }
  }

  return graph;
}

// go through letters and update graph part
function updateGraphPart(
  which: "onset" | "nucleus" | "coda",
  graphPart: SonorityGraphPart,
  letters: Array<string>,
  // first phone of next part
  nextPart: string | undefined
) {
  // initial part of graph
  if (which === "onset") {
    incGraphPart(graphPart, undefined, letters?.[0] ?? nextPart);
  }
  if (letters == undefined) {
    return;
  }

  let letter: string | undefined = letters[0];
  for (const next of [...letters.slice(1), nextPart]) {
    incGraphPart(graphPart, letter, next);
    letter = next;
  }
}

function incGraphPart(
  graphPart: SonorityGraphPart,
  letter: string | undefined,
  next: string | undefined
) {
  const existing = graphPart.get(letter);
  if (existing) {
    const existingNext = existing.find((e) => e[0] === next);
    let updated: Array<[string | undefined, number]>;
    if (existingNext) {
      existingNext[1] += 1;
    } else {
      updated = [...existing, [next, 1]];
      graphPart.set(letter, updated);
    }
  } else {
    graphPart.set(letter, [[next, 1]]);
  }
}

export function printGraph(graph: SonorityGraph) {
  const printGraphPart = (
    i: number,
    label: string,
    part: SonorityGraphPart
  ): string => {
    return `subgraph cluster_${i} {
        color = "blue";
        label = "${label}";
${[...part.keys()]
  .filter((letter) => letter !== undefined)
  .map((letter) => `${label}_${letter} [label="${letter}"];`)
  .join("\n")}
    }
    `;
  };

  const nodeName = (letter: string | undefined, atOrAfter: number) => {
    let pref;
    if (atOrAfter === 0 && graph.parts[0].has(letter)) {
      pref = "onset";
    } else if (atOrAfter <= 1 && graph.parts[1].has(letter)) {
      pref = "vowel";
    } else if (atOrAfter > 0 && graph.parts[2].has(letter)) {
      pref = "coda";
    }
    if (letter == undefined) {
      return "end";
    }

    return `${pref}_${letter}`;
  };

  const edges: Array<string> = [];
  const starts = graph.parts[0].get(undefined);
  edges.push(...starts!.map(([letter]) => `st -> ${nodeName(letter, 0)};`));
  let i = 0;
  for (const part of graph.parts) {
    edges.push(
      [...part.entries()]
        .filter(([letter]) => letter !== undefined)
        .map(([letter, nexts]) =>
          nexts
            .map(([next]) => `${nodeName(letter, i)} -> ${nodeName(next, i)};`)
            .join("\n")
        )
        .join("\n")
    );
    i += 1;
  }

  const output = `
  digraph "Sonority" {
    rankdir=LR;
    graph [fontsize=10 fontname="Verdana" compound=true];
    node [shape=record fontsize=10 fontname="Verdana"];

    st [label="Start"];
    end [label="End"];
    
    ${edges.join("\n")}

    ${printGraphPart(0, "onset", graph.parts[0])}
    ${printGraphPart(1, "vowel", graph.parts[1])}
    ${printGraphPart(2, "coda", graph.parts[2])}
}
  `;
  return output;
}

function randomChoice<T>(a: Array<T>): T {
  return a[Math.floor(Math.random() * a.length)];
}

function weightedRandomChoice<T>(a: Array<[T, number]>): T {
  let i;
  let weights: Array<number> = [];

  for (i = 0; i < a.length; i++) weights[i] = a[i][1] + (weights[i - 1] || 0);

  var random = Math.random() * weights[weights.length - 1];

  for (i = 0; i < weights.length; i++) if (weights[i] > random) break;

  return a[i][0];
}

export function getRandomSyllable(graph: SonorityGraph): Array<string> {
  let word = [];
  let next = weightedRandomChoice(graph.parts[0].get(undefined)!);

  let currentPart = 0;
  while (next && currentPart < 3) {
    word.push(next);
    let graphPart;
    if (graph.parts[currentPart].has(next)) {
      graphPart = graph.parts[currentPart];
    } else {
      currentPart++;
      graphPart = graph.parts[currentPart];
    }
    next = weightedRandomChoice(graphPart.get(next)!);
  }

  return word;
}

export function getRandomSyllableFromPallete(
  graph: SonorityGraph,
  pallete: Array<string>
): Array<string> | undefined {
  let word = [];
  // TODO: remove from palette as you usefrom a graph,
  // so kstrtruhr is not possible (repeated t and r in onset)
  const randomTilInPalete = (from: Array<[string | undefined, number]>) => {
    const filteredFrom = from.filter(
      ([l]) => l === undefined || pallete.includes(l!)
    );
    if (filteredFrom.length === 0) {
      return undefined;
    }
    return weightedRandomChoice(filteredFrom);
  };
  let next = randomTilInPalete(graph.parts[0].get(undefined)!);
  if (next === undefined) {
    return undefined;
  }

  let currentPart = 0;
  while (next && currentPart < 3) {
    word.push(next);
    let graphPart;
    if (graph.parts[currentPart].has(next)) {
      graphPart = graph.parts[currentPart];
    } else {
      currentPart++;
      graphPart = graph.parts[currentPart];
    }
    next = randomTilInPalete(graphPart.get(next)!);
  }

  return word;
}

// const consonantsOrExtra = new Set("bcdfghjklmnpqrstvwxzʒ̥ʰ͡(ɹ)ðʃθɡŋʍɫ˨ʔɾɵɯ");
// const vowels = new Set("aɪəɔʊɛjɜːuʌɒoɑæei");
const vowels = new Set([
  "a",
  "ɑ", // ɑ or ɒ
  "æ",
  "ʌ",
  "ɔ",
  "aʊ",
  "əɹ", // ɚ
  "ə",
  "aɪ",
  "ɛ",
  "ɛɹ", // ɝ
  "eɪ",
  "ɪ",
  "ɨ",
  "i",
  "oʊ",
  "ɔɪ",
  "ʊ",
  "u",
  "ʉ",
]);

const consonantsOrExtra = new Set([
  "b",
  "tʃ",
  "d",
  "ð",
  "ɾ",
  "l̩",
  "m̩",
  "n̩",
  "f",
  "ɡ",
  "h",
  "h",
  "dʒ",
  "k",
  "l",
  "m",
  "n",
  "ŋ",
  "ɾ̃",
  "p",
  "ʔ",
  "ɹ",
  "s",
  "ʃ",
  "t",
  "θ",
  "v",
  "w",
  "ʍ",
  "j",
  "z",
  "ʒ",
]);

function splitIntoChunks(
  syll: Array<string>
): [Array<string>, Array<string>, Array<string>] {
  let onset = [];
  let vowel = [];
  let coda = [];
  let state: "onset" | "vowel" | "coda" = "onset";
  for (const p of syll) {
    if (state == "onset") {
      if (consonantsOrExtra.has(p)) {
        onset.push(p);
      } else if (vowels.has(p)) {
        vowel.push(p);
        state = "vowel";
        continue;
      } else {
        // no vowel at all...
        return [[], [], []];
      }
    } else if ((state = "vowel")) {
      // actually, we don't expect multiple vowels in the same syllable...
      // but might as well tolerate it in case of bad data.
      if (vowels.has(p)) {
        vowel.push(p);
      } else {
        coda.push(p);
        state = "coda";
      }
    } else if ((state = "coda")) {
      if (consonantsOrExtra.has(p)) {
        coda.push(p);
      } else {
        // vowels again in coda...
        return [[], [], []];
      }
    }
  }
  return [onset, vowel, coda];
}

if (require.main === module) {
  const graph = createSonorityGraph([
    ["cat", [["c", "a", "t"]]],
    ["hat", [["h", "a", "t"]]],
    ["at", [["a", "t"]]],
    ["ant", [["a", "n", "t"]]],
    ["it", [["i", "t"]]],
    ["hut", [["h", "u", "t"]]],
    ["but", [["b", "u", "t"]]],
    ["booth", [["b", "oʊ", "θ"]]],
    ["boo", [["b", "oʊ"]]],
    ["truth", [["t", "r", "u", "θ"]]],
    ["bun", [["b", "u", "n"]]],
    ["bund", [["b", "u", "n", "d"]]],
    ["bundt", [["b", "u", "n", "d", "t"]]],
    ["bring", [["b", "r", "i", "n", "g"]]],
    ["thing", [["t", "h", "i", "n", "g"]]],
    ["shin", [["s", "h", "i", "n"]]],
    ["sing", [["s", "i", "n", "g"]]],
    ["wing", [["w", "i", "n", "g"]]],
    ["win", [["w", "i", "n"]]],
    [
      "singing",
      [
        ["s", "i", "n", "g"],
        ["i", "n", "g"],
      ],
    ],
  ]);

  console.log("graph:", util.inspect(graph, undefined, 8));
  console.log(printGraph(graph));

  for (var i = 0; i < 10; i++) {
    console.log("random syllable: ", getRandomSyllable(graph));
  }

  for (var i = 0; i < 10; i++) {
    const palette = ["b", "u", "n", "i", "d", "t", "a", "s", "w"];
    console.log(
      "random syllable in palette: ",
      palette.join(""),
      getRandomSyllableFromPallete(graph, palette)?.join("")
    );
  }
}
