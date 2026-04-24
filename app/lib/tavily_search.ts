import {tool} from "@langchain/core/tools";
import {TavilySearch} from "@langchain/tavily";
import {z} from "zod";

const tavilySearch = new TavilySearch({
    maxResults: 20,
});

export const tavilySearchTool = tool(
    async ({query}) => {
        return await tavilySearch.invoke({query: query});
    },
    {
        name: "tavily_search_tool",
        description: "A professional Real Estate search engine. Use this to find properties on the wider internet, real estate news, or general facts.",
        schema: z.object({
            query: z.string().describe("A highly optimized Google search query. Keep it concise (e.g., 'Dubai Marina 2BHK apartment rent prices').")
        }),
    }
);