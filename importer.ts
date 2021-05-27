import {
  eachAsync,
  runSerial,
} from "https://raw.githubusercontent.com/reima-ecom/reima-theme/main/importers/lib/lazy-list/mod.ts";
import parse from "https://denopkg.com/nekobato/deno-xml-parser/index.ts";

const [FILENAME] = Deno.args;

type Unwrap<T> = T extends Promise<infer U> ? U
  : T;

const mapAsync = <F extends (arg: any) => any | Promise<any>>(fn: F) =>
  async function* generatorMapper(
    generator: Generator<Parameters<F>[0]> | AsyncGenerator<Parameters<F>[0]>,
  ): AsyncGenerator<Unwrap<ReturnType<F>>> {
    for await (const element of generator) {
      yield fn(element);
    }
  };

async function* readLine(path: string): AsyncGenerator<string> {
  const contents = await Deno.readTextFile(path);
  for (const line of contents.split("\n")) {
    yield Promise.resolve(line);
  }
}

const downloadMediaBankXml = async (productNumber: string) => {
  const response = await fetch(
    `https://reima.mediabank.fi/fi/extension/onesite/xml/${productNumber}`,
  );
  return {
    product: productNumber,
    xml: await response.text(),
  };
};

type Image = {
  product: string;
  name: string;
  url: string;
};

const xmlToImage = (
  doc: Unwrap<ReturnType<typeof downloadMediaBankXml>>,
): Image[] | undefined => {
  const xml = parse(doc.xml);
  return xml.root?.children.map((element, i) => ({
    product: doc.product,
    name: `${i.toString().padStart(2, "0")}-${element.attributes.name}`,
    url: element.attributes.url,
  }));
};

const downloadImagesParallel = async (
  images: Unwrap<ReturnType<typeof xmlToImage>>,
): Promise<void> => {
  await Promise.all(
    images?.map(async (image) => {
      const data = (await fetch(image.url)).arrayBuffer();
      const dir = `product-images/${image.product}`;
      Deno.mkdir(dir, { recursive: true });
      return Deno.writeFile(
        `${dir}/${image.name}`,
        new Uint8Array(await data),
      );
    }) || [],
  );
};

console.log("Getting products based on", FILENAME);

await Promise.resolve(FILENAME)
  .then(readLine)
  .then(mapAsync(downloadMediaBankXml))
  .then(mapAsync(xmlToImage))
  .then(eachAsync(downloadImagesParallel))
  .then(runSerial);
