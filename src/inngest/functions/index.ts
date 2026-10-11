import { captureOnePage } from "./capture-page";
import { helloWorld } from "./hello-world";
import { processReport } from "./process-report";
import { runInvestigation } from "./run-investigation";
import { runPriceCheck } from "./price-check";
import { syncKnowledgeSource, syncKnowledgeSourceCancelled } from "./sync-source";

export const functions = [runPriceCheck, helloWorld, captureOnePage, syncKnowledgeSource, syncKnowledgeSourceCancelled, runInvestigation, processReport];
