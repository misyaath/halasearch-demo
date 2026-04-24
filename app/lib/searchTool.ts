import {DeepResearchSearchService} from "./DeepResearchSearchService";

export {DeepResearchSearchService} from "./DeepResearchSearchService";

let deepResearchToolInstance: ReturnType<DeepResearchSearchService["createTool"]> | null = null;

export function useDeepResearchTool() {
    if (!deepResearchToolInstance) {
        deepResearchToolInstance = new DeepResearchSearchService().createTool();
    }

    return deepResearchToolInstance;
}

// Backward-compatible export for existing imports.
export const deepResearchTool = useDeepResearchTool();
