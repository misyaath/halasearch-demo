// import {tool} from "@langchain/core/tools";
// import {z} from "zod";
// import {db} from "./db";
// import {RunnableConfig} from "@langchain/core/runnables";
//
// export const propertyFinderOmniTool = tool(
//     async (args, config: RunnableConfig) => {
//         const {
//             endpoint_type, location, property_type, bedrooms, bathrooms,
//             price_min, price_max, rent_frequency, area_min, area_max,
//             furnishing, amenities, sort
//         } = args;
//
//         const chat_id = config.configurable?.thread_id || "unknown_chat";
//
//         console.log(`[API] Building query for: ${endpoint_type} in ${location} (Chat: ${chat_id})`);
//
//         const BASE_URL = "https://propertyfinderapi.com/api";
//         const HEADERS = {
//             "Authorization": `Bearer ${process.env.PROPERTY_FINDER_API_KEY}`,
//             "Content-Type": "application/json"
//         };
//
//         try {
//             // ==========================================
//             // STEP 1: AUTOCOMPLETE LOCATION
//             // ==========================================
//             const autoUrl = new URL(`${BASE_URL}/autocomplete-location`);
//             autoUrl.searchParams.append('query', location);
//
//             const autoResponse = await fetch(autoUrl.toString(), {method: 'GET', headers: HEADERS});
//             if (!autoResponse.ok) throw new Error("Autocomplete API Failed");
//
//             const autoJson = await autoResponse.json();
//             const locations = autoJson.data || [];
//
//             if (locations.length === 0) {
//                 return `No exact location matches found for "${location}". Please ask the user to clarify.`;
//             }
//
//             let searchPath = "";
//             switch (endpoint_type) {
//                 case "rent":
//                     searchPath = "/search-rent";
//                     break;
//                 case "buy":
//                     searchPath = "/search-buy";
//                     break;
//                 case "commercial_rent":
//                     searchPath = "/search-commercial-rent";
//                     break;
//                 case "commercial_buy":
//                     searchPath = "/search-commercial-buy";
//                     break;
//                 case "new_projects":
//                     searchPath = "/search-new-projects";
//                     break;
//                 default:
//                     searchPath = "/search-rent";
//             }
//
//             const allSavedProperties = [];
//
//             // ==========================================
//             // STEP 2: ITERATE OVER LOCATIONS & PAGINATE
//             // ==========================================
//             for (const loc of locations.slice(0, 1)) {
//                 for (let page = 1; page <= 10; page++) {
//                     const searchUrl = new URL(`${BASE_URL}${searchPath}`);
//
//                     searchUrl.searchParams.append("location_id", loc.id);
//                     searchUrl.searchParams.append("page", page.toString());
//
//                     const filters = {
//                         property_type,
//                         bedrooms,
//                         bathrooms,
//                         price_min,
//                         price_max,
//                         rent_frequency,
//                         area_min,
//                         area_max,
//                         furnishing,
//                         amenities,
//                         sort
//                     };
//                     for (const [key, value] of Object.entries(filters)) {
//                         if (value) searchUrl.searchParams.append(key, value);
//                     }
//
//                     const searchResponse = await fetch(searchUrl.toString(), {headers: HEADERS});
//                     if (!searchResponse.ok) break;
//
//                     const searchJson = await searchResponse.json();
//                     const basicProperties = searchJson.data || [];
//
//                     if (basicProperties.length === 0) break;
//
//                     // ==========================================
//                     // STEP 3: PARALLEL DB SAVE (Skipping detail fetch!)
//                     // ==========================================
//                     const pagePromises = basicProperties.map(async (property) => {
//                         try {
//                             const propertyId = String(property.property_id || property.id);
//
//                             // SAVE TO POSTGRESQL WITH NEW SCHEMA DIRECTLY
//                             await db.propertyCache.upsert({
//                                 where: {property_id: propertyId},
//                                 update: {
//                                     chat_id: chat_id,
//                                     raw_json: property, // Saved directly from the list API!
//                                     endpoint_type,
//                                     location: loc.id,
//                                     property_type,
//                                     bedrooms,
//                                     bathrooms,
//                                     price_min,
//                                     price_max,
//                                     rent_frequency,
//                                     area_min,
//                                     area_max,
//                                     furnishing,
//                                     amenities,
//                                     sort,
//                                     updatedAt: new Date()
//                                 },
//                                 create: {
//                                     property_id: propertyId,
//                                     chat_id: chat_id,
//                                     source: "property finder",
//                                     raw_json: property,
//                                     endpoint_type,
//                                     location: loc.name,
//                                     property_type,
//                                     bedrooms,
//                                     bathrooms,
//                                     price_min,
//                                     price_max,
//                                     rent_frequency,
//                                     area_min,
//                                     area_max,
//                                     furnishing,
//                                     amenities,
//                                     sort
//                                 }
//                             });
//
//                             return property;
//                         } catch (err) {
//                             console.error(`Failed to save property to database`, err);
//                             return null;
//                         }
//                     });
//
//                     // Wait for all DB saves on this page to finish
//                     const savedPageResults = (await Promise.all(pagePromises)).filter(p => p !== null);
//                     allSavedProperties.push(...savedPageResults);
//                 }
//             }
//
//             console.log(`[Database] Successfully saved ${allSavedProperties.length} properties in record time.`);
//             return JSON.stringify(allSavedProperties);
//
//         } catch (error) {
//             console.error("[API Tool Error]:", error);
//             return "Failed to fetch properties. Tell the user to try a different location or check the API connection.";
//         }
//     },
//     {
//         name: "deep_research_tool",
//         description: "Searches the live real estate API. Use this ONLY if the internal database tool returns no results.",
//         schema: z.object({
//             endpoint_type: z.enum(["rent", "buy", "commercial_rent", "commercial_buy", "new_projects"]).describe("Analyze the user's prompt to determine the transaction type."),
//             location: z.string().describe("The city or neighborhood (e.g., 'Dubai Marina')"),
//             bedrooms: z.string().optional().describe("- Number of bedrooms as comma-separated values - Use `0` for studio apartments"),
//             property_type: z.string().optional().describe("- Type of property to search. Common: `apartment`, `villa`, `penthouse`"),
//             bathrooms: z.string().optional().describe("- Number of bathrooms as comma-separated values"),
//             price_min: z.string().optional().describe("- Minimum annual rent price in AED"),
//             price_max: z.string().optional().describe("- Maximum annual rent price in AED"),
//             rent_frequency: z.string().optional().describe("- Rent payment frequency - Options: `yearly`, `monthly`, `weekly`, `daily`"),
//             area_min: z.string().optional().describe("- Minimum property area in sqft"),
//             area_max: z.string().optional().describe("- Maximum property area in sqft"),
//             furnishing: z.string().optional().describe("- Furnishing status filter - Options: `furnished`, `unfurnished`, `partly`"),
//             amenities: z.string().optional().describe("- Filter by property amenities as comma-separated values"),
//             sort: z.string().optional().describe("- Sort order for results - Options: `newest`, `featured`, `price_asc`, `price_desc`"),
//         }),
//     }
// );