import { captureOnePage } from "./capture-page";
import { helloWorld } from "./hello-world";
import { runInvestigation } from "./run-investigation";
import { runPriceCheck } from "./price-check";
import { syncKnowledgeSource } from "./sync-source";

export const functions = [runPriceCheck, helloWorld, captureOnePage, syncKnowledgeSource, runInvestigation];
