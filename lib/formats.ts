// The kinds of work a threeangle can start from. Shared by the API schema and the "help us find it" form.
export const FORMATS=['Book','Article','Movie','Documentary','Show','Podcast episode'] as const;
export type Format=(typeof FORMATS)[number];
