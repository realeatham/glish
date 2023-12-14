import { promises as fs } from "fs";
import { respellIPA } from "./respellIPA";
import {
  constuctSyllablizedPronunciations,
  evaluateSyllablization,
  loadSyllabalizedPronuncations,
} from "./syllablize";
import { pad } from "./util";

type IPA = string;

type Context = {
  monosyllabizedWordsList: Array<
    [
      /* original word in english */ string,
      /* original pronunciation */ IPA,
      /* monosyllabic pronunciation */ IPA
    ]
  >; // words in IPA so far in order
  monosyllabizedWordsSet: Set<IPA>; // words so far, to check for inclusion / already exists
};

type StategyFn = (syllables: Array<IPA>, ctx: Context) => string | null;
const strategies: Array<StategyFn> = [eachSyllable(notUsedYet)];

type StategyForSyllableFn = (
  syllable: IPA,
  syllables: Array<IPA>,
  ctx: Context
) => string | undefined;

/**
 * If the syllable is no already in our list of monosyllablized words, we can use it directly
 * e.g. business -> bɪz
 */
function notUsedYet(syllable: IPA, _syllables: Array<IPA>, ctx: Context) {
  return ctx.monosyllabizedWordsSet.has(syllable) ? undefined : syllable;
}

/**
 * Given a strategy that is centered on an existing syllable,
 * try it for each syllable in the word in order from left to right.
 * e.g. business would try `strat` on /bɪz/ then /nɪs/
 */
function eachSyllable(strat: StategyForSyllableFn): StategyFn {
  return (syllables: Array<IPA>, ctx: Context) =>
    syllables.find((syllable) => strat(syllable, syllables, ctx));
}

async function main() {
  // const syllablizedPronuncations = await loadSyllabalizedPronuncations();
  // just use cached version
  const syllablizedPronuncations = JSON.parse(
    await fs.readFile("./outputs/syllablizedIPA.json", {
      encoding: "utf-8",
    })
  ) as { [key: string]: string };

  const entries = Object.entries(syllablizedPronuncations);
  // console.log(
  //   entries
  //     .slice(0, 500)
  //     .filter(([word, value]) => value.includes("|"))
  // );
  const oneSyllable = entries.filter(([word, value]) => !value.includes("|"));
  const multiSyllable = entries.filter(([word, value]) => value.includes("|"));

  const seen = new Set();
  const assignments = new Map<string, string>();

  for (const [word, syll] of oneSyllable) {
    seen.add(syll);
    // assignments.set(word, syll);
  }

  let assignSuccesses = [];

  // for (const [word, syllsStr] of multiSyllable.slice(0, 500)) {
  for (const [word, syllsStr] of multiSyllable) {
    const sylls = syllsStr.split("|");
    const firstunused = sylls.find((syll) => !seen.has(syll));
    if (firstunused == null) {
      console.log("❌ couldnt assign %s, theyre all taken", word);
      assignments.set(word, `#${word}#`);
      assignSuccesses.push(false);
    } else {
      seen.add(firstunused);
      assignments.set(word, firstunused);
      console.log("✅ assigned %s -> %s", word, firstunused);
      assignSuccesses.push(true);
    }
  }

  console.log(assignments);
  const first500Success =
    (100 * assignSuccesses.slice(0, 500).filter(Boolean).length) / 500;
  const first5000Success =
    (100 * assignSuccesses.slice(0, 5000).filter(Boolean).length) / 5000;
  const first50000Success =
    (100 * assignSuccesses.slice(0, 50000).filter(Boolean).length) / 50000;
  console.log("first 500 success rate:", first500Success);
  console.log("first 5000 success rate:", first5000Success);
  console.log("first 50000 success rate:", first50000Success);

  const monosyllabicResult: { [key: string]: string } = {};

  for (const [word, syll] of entries) {
    const mono = syll.includes("|") ? assignments.get(word) : syll;
    if (mono) {
      monosyllabicResult[word] = mono;
    }
  }

  {
    const resultWithSingleSyllFilename = "outputs/monosyllabic.json";
    console.log(
      "writing monosyllabic result to ",
      resultWithSingleSyllFilename
    );
    await fs.writeFile(
      resultWithSingleSyllFilename,
      JSON.stringify(monosyllabicResult, undefined, 2)
    );
  }
  {
    const resultFilename = "outputs/monosyllabic_only_modified_words.json";
    console.log("writing monosyllabic result to ", resultFilename);
    await fs.writeFile(
      resultFilename,
      JSON.stringify(Object.fromEntries(assignments.entries()), undefined, 2)
    );
  }
  {
    const resultWithSingleSyllFilename = "outputs/respelled.json";
    console.log(
      "writing monosyllabic result to ",
      resultWithSingleSyllFilename
    );
    await fs.writeFile(
      resultWithSingleSyllFilename,
      JSON.stringify(
        Object.fromEntries(
          Object.entries(monosyllabicResult).map(([word, mono]) => [
            word,
            respellIPA(mono),
          ])
        ),
        undefined,
        2
      )
    );
  }
  {
    const resultFilename = "monosyllable-ui/src/routes/monosyllabic.ts";
    console.log(
      "writing ui-consumable monosyllabic result to ",
      resultFilename
    );
    await fs.writeFile(
      resultFilename,
      "export const monosyllabic = new Map<string, {mono: string, respelled_mono: string, multiSyllable: boolean}>(" +
        JSON.stringify(
          Object.entries(monosyllabicResult).map(([word, mono]) => {
            return [
              word,
              {
                mono,
                multiSyllable: assignments.has(word),
                respelled_mono: respellIPA(mono),
              },
            ];
          }),
          undefined,
          2
        ) +
        ");"
    );
  }

  // console.log(syllablizedPronuncations);
  /*
  for (const [word, ipasyllables] of syllablizedPronuncations) {
    if (ipasyllables.includes("|")) {
      const referenceSyllables = syllables.get(word);
      console.log(
        `[${pad(`'${word}',`, 15)} ${pad(
          `'${ipasyllables}'],`,
          20
        )} // ${referenceSyllables.join("|")}`
      );
    }
  }
  */
  // console.log(syllablizedPronuncations.slice(100, 120));

  // const allIPASymbols = new Set();
  // for (const word of pronunciations.values()) {
  //   for (const symbol of word) {
  //     allIPASymbols.add(symbol);
  //   }
  // }
  // console.log("all IPA: ");
  // console.log([...allIPASymbols].map((s) => `['${s}', []],`).join("\n"));

  return;

  const ctx: Context = {
    monosyllabizedWordsList: [],
    monosyllabizedWordsSet: new Set(),
  };

  // create monosyllabic forms of all words using our strategy

  for (const word of orderedWordsWithPronunciations) {
    const pronunciations = pronunciationsForWord.get(word);
    const pronunciation = pronunciations[0]; // TODO: pick best of options somehow

    const syllables = pronunciation
      .split(/['.]/)
      .filter((syl) => syl.length > 0);

    if (syllables.length === 0) {
      console.error(
        `"${word}" has no syllables...? ${pronunciations.join(", ")}`
      );
      continue;
    } else if (syllables.length === 1) {
      ctx.monosyllabizedWordsList.push([word, pronunciation, pronunciation]);
      ctx.monosyllabizedWordsSet.add(pronunciation);
    } else {
      // we need to convert this word to be one syllable

      for (const strategy of strategies) {
        const result = strategy(syllables, ctx);
        if (result != null) {
          ctx.monosyllabizedWordsList.push([word, pronunciation, result]);
          ctx.monosyllabizedWordsSet.add(result);
        } else {
          console.error(
            `No strategy produced a monosyllabized verison of "${word}"`
          );
          // TODO: just construct a random IPA for it instead...? Or, just make our strategies good
        }
      }
    }
  }
}

main();

const knownEvaluations: {
  [origWord: string]: Array<{ score: 1 | 2 | 3 | 4 | 5; monosyllabized: IPA }>;
} = {};

const wordsToEvaluate = [];

function evaluate(context: Context) {}
