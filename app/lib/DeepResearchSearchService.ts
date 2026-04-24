import {tool} from "@langchain/core/tools";
import {z} from "zod";
import {Configuration, MemoryStorage, PlaywrightCrawler, purgeDefaultStorages} from "crawlee";
import {TavilySearch} from "@langchain/tavily";
import {RunnableConfig} from "@langchain/core/runnables";
import {ChatOllama} from "@langchain/ollama";

const deepResearchSchema = z.object({
    optimized_query: z.string().describe(
        "A highly optimized, keyword-only search string. " +
        "RULES: " +
        "1. Remove all conversational words. " +
        "2. ONLY include specific parameters (Emirate, bedrooms, price) IF explicitly stated by the user. Do NOT hallucinate or guess missing values. " +
        "3. If no specific Emirate or location is mentioned, append 'UAE' to make it a general search. " +
        "4. Standardize bedrooms (e.g., 1BHK, 2BHK). " +
        "EXAMPLES: " +
        "[Specific]: '1BHK Karama balcony 80000 AED' | " +
        "[General]: 'apartments, villas, etc UAE'"
    ),
});

const uaePropertyWebsites = [
    "propertyfinder.ae", "bayut.com", "dubizzle.com", "houza.com", "zoomproperty.com",
    "justproperty.com", "yzerproperty.com", "emirates.estate", "findproperties.ae", "fazwaz.ae",
    "bhomes.com", "famproperties.com", "drivenproperties.com", "allsoppandallsopp.com", "metropolitan.realestate",
    "hausandhaus.com", "espace.ae", "dacha.ae", "aquaproperties.com", "providentestate.com",
    "edwardsandtowers.com", "dandbdubai.com", "hsproperty.ae", "azcorealestate.ae", "luxhabitat.ae",
    "engelvoelkers.com", "homes4life.ae", "dubai.savills.ae", "exclusive-links.com", "lacapitaledubai.com",
    "abu-dhabi.realestate", "astonpearlre.com", "keyonerealestate.com", "a1properties.ae", "tsrrealestate.com",
    "ddarealestate.com", "daytonaproperties.ae", "infinityrealty.ae", "tekce.com", "wiseview.ae",
    "crcproperty.com", "mcconeproperties.com", "aeontrisl.com", "christiesrealestate.com", "paragonproperties.ae",
    "primalalliance.ae", "zeuscapital.ae", "eliteestates.ae", "whiteandco.net", "xtenrealestate.com",
    "alsaffar.ae", "huspy.com", "cbbproperties.com", "remax.ae", "estateinvest.ae",
    "patriot.ae", "realchoicedubai.com", "rockyrealestate.com", "edgerealty.ae", "hamptons.ae",
    "alhabtoorproperties.com", "oceanviewdubai.com", "powerhousedubai.com", "binayah.com", "asteco.com",
    "psinv.net", "chestertonsmena.com", "sothebysrealty.ae", "uniqueproperties.ae", "tanamiproperties.com",
    "emaar.com", "aldar.com", "nakheel.com", "damacproperties.com", "sobharealty.com",
    "danubeproperties.com", "arada.com", "tigerproperties.ae", "deyaar.ae", "azizidevelopments.com",
    "meydan.ae", "meraas.com", "dp.ae", "kleindienst.ae", "shapoorjipallonji.com",
    "seventides.com", "mag.global", "synergygroupdubai.com", "merakidevelopers.com", "prestigeone.ae",
    "colliers.com/en-ae", "knightfrank.ae", "jll-mena.com", "cushwake.ae", "waslproperties.com",
    "buzzon.com", "99acres.com/uae-real-estate.htm", "rightmove.co.uk/overseas/united-arab-emirates", "rentola.ae", "properstar.ae"
];

const optimizerLlm = new ChatOllama({
    model: "llama3.1",
    temperature: 0, // 0 is crucial so it doesn't hallucinate the query
});

// 2. Define the exact shape of the data you want Tavily to use
const tavilyOptimizerSchema = z.object({
    // Changed from string to an array of strings!
    queries: z.array(z.string()).min(1).max(3).describe(
        "An array of 1 to 3 highly optimized, keyword-only search queries. " +
        "Break complex requests down into separate focused sub-queries (e.g., ['Company ABC competitors', 'Company ABC financials']). " +
        "Keep each query under 100 characters and keyword-focused."
    ),
    topic: z.enum(["general"])
        .default("general")
        .describe("Set to 'news' ONLY if the user explicitly asks for recent events or breaking news."),
    searchDepth: z.enum(["advanced"])
        .default("advanced")
        .describe("Set to 'advanced' for deep research, 'basic' for quick widely known facts."),
});

type DeepResearchInput = z.infer<typeof deepResearchSchema>;

type SearchResult = {
    results?: Array<{ url?: string }>;
};

export class DeepResearchSearchService {
    private wait(ms: number): Promise<void> {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    private buildSearchQuery(optimizedQuery: string): string {
        return `${optimizedQuery}`;
    }

    private async fetchCandidateUrls(finalSearchString: string): Promise<string[]> {
        const maxResults = 10;
        const maxPages = 5;
        const delayMs = 800;
        const allUrls = new Set<string>();
        const baseUrl = `${process.env.SEARXNG_BASE_URL}/search?q=${encodeURIComponent(finalSearchString)}&format=json&categories=general`;

        for (let page = 1; page <= maxPages && allUrls.size < maxResults; page++) {
            console.log(`[SearXNG] Fetching page ${page}...`);
            const searchRes = await fetch(`${baseUrl}&pageno=${page}`);

            if (!searchRes.ok) {
                console.error("SearXNG API failed:", searchRes.status, searchRes.statusText);
                break;
            }

            const data = (await searchRes.json()) as SearchResult;
            const pageResults = data.results ?? [];

            if (pageResults.length === 0) {
                console.log("[SearXNG] No more results available.");
                break;
            }

            for (const result of pageResults) {
                if (result.url) {
                    allUrls.add(result.url);
                    if (allUrls.size >= maxResults) {
                        break;
                    }
                }
            }

            if (allUrls.size < maxResults) {
                await this.wait(delayMs);
            }
        }

        const candidateUrls = Array.from(allUrls).slice(0, maxResults);
        console.log(`[SearXNG] Successfully fetched ${candidateUrls.length} results.`);
        return candidateUrls;
    }

    private async scrapeUrl(url: string[]): Promise<string> {
        const scrapedResults: string[] = [];

        const storageClient = new MemoryStorage();

        // 2. Create a custom configuration using that storage
        const customConfig = new Configuration({
            storageClient,
            purgeOnStart: true, // Automatically cleans up memory on every run
        });

        await purgeDefaultStorages();

        const crawler = new PlaywrightCrawler({
            maxRequestRetries: 1,
            requestHandlerTimeoutSecs: 30,
            maxConcurrency: 10,

            launchContext: {
                launchOptions: {
                    args: ['--no-sandbox', '--disable-setuid-sandbox']
                }
            },
            async requestHandler({page, request}) {

                await page.waitForLoadState('networkidle', {timeout: 15000})

                const text = await page.evaluate(() => {
                    const selectorsToRemove = [
                        "script", "style", "nav", "footer", "header", "aside", "form", "iframe", "noscript", ".ad-banner", ".cookie-consent"
                    ];

                    for (const selector of selectorsToRemove) {
                        for (const element of document.querySelectorAll(selector)) {
                            element.remove();
                        }
                    }

                    return document.body?.innerText?.replace(/\s+/g, " ").trim() ?? "";
                });

                if (text) {
                    scrapedResults.push(`\n--- Source: ${request.url} ---\n${text}...\n`);
                }

            },
            failedRequestHandler({request, log}) {
                log.error(`Request ${request.url} failed completely.`);
            }
        }, customConfig);

        await crawler.run(url);
        return scrapedResults.join("\n");
    }

    async invoke_tavily_search(rawText: string) {
        console.log(`[Agent Action] Executing Tavily search: ${rawText}`);

        const structuredOptimizer = optimizerLlm.withStructuredOutput(tavilyOptimizerSchema, {
            name: "query_optimizer"
        });

        let optimizedArgs;

        try {
            console.log(`[Tavily] Running Query Optimizer LLM...`);
            optimizedArgs = await structuredOptimizer.invoke([
                ["system", "You are an expert search query optimizer. Break the user's conversational request into 1-3 strict search sub-queries."],
                ["human", rawText]
            ]);
            console.log(`[Tavily] Optimizer output:`, optimizedArgs);
        } catch (error) {
            console.warn(`[Tavily] Optimizer failed. Falling back to raw text. Error:`, error);
            optimizedArgs = {optimized_query: rawText, topic: "general", searchDepth: "advanced"};
        }

        const tool = new TavilySearch({
            maxResults: 10,
            topic: "general",
            searchDepth: "advanced",
            timeRange: "month",
            includeRawContent: true,
            includeDomains: uaePropertyWebsites,
        });

        const searchPromises = optimizedArgs.queries.map(async (q: string) => {
            const response = await tool.invoke({query: q});
            return response['results'];
        });

        const allResultsArrays = await Promise.all(searchPromises);
        return allResultsArrays.flat();
    }

    async execute({optimized_query}: DeepResearchInput, rawUserText: string): Promise<string> {
        const finalSearchString = this.buildSearchQuery(optimized_query);
        console.log(`[Agent Action] Executing search: ${finalSearchString}`);

        try {
            const validUrls = await this.fetchCandidateUrls(finalSearchString);

            if (validUrls.length === 0) {
                return "I searched the web but could not find results for this query.";
            }

            const searchContent = await this.scrapeUrl(validUrls)
            const tavilyContent = await this.invoke_tavily_search(finalSearchString)
            return searchContent + "\n" + tavilyContent;
        } catch (error) {
            console.log(error);
            return "Failed to execute search tool.";
        }
    }

    createTool() {
        return tool(
            async (args: DeepResearchInput, config?: RunnableConfig) => {
                const rawUserText = config?.configurable?.rawUserText || args.optimized_query;
                return this.execute(args, rawUserText as string);
            },
            {
                name: "deep_research_tool",
                description: "Searches verified UAE real estate databases. You MUST provide an optimized search query.",
                schema: deepResearchSchema,
            }
        );
    }
}
