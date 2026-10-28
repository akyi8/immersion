import text from './structure-guidance.md?raw';
import { readStructures } from './structures';

/** The story structures, with Mike's guidance for each part (design: Story structures). */
export const STRUCTURES = readStructures(text);
