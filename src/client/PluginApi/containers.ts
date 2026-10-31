import { AnsiAwareBuffer } from "@client/ansi/FormatState";
import {
  addGroupDefinition,
  addTransformDefinition,
  getGroupDefinitions,
  getTransformDefinitions,
} from "@client/scripts/prettyContainers";
import {
  assignContainer,
  containerAction,
  getContainer,
  getContainerCommandForms,
  getContainerForms,
  inspectContainer,
  listKnownBags,
  registerContainerType,
  unregisterContainerType,
} from "@client/scripts/bagManager";
import type { PluginApiContext } from "./context";

/**
 * Group definition for categorizing container items
 */
export interface GroupDefinition {
  /** Group name */
  name: string;
  /** Filter function to check if item belongs to this group */
  filter: (item: string) => boolean;
}

/**
 * Transform definition for styling container items
 */
export interface TransformDefinition {
  /**
   * Transform item buffer with optional formatting
   * @param buffer - The AnsiAwareBuffer containing the item name
   * @param item - The container item with name and count
   * @param group - The group name this item belongs to
   * @returns The buffer (modified or unmodified)
   */
  transform: (buffer: AnsiAwareBuffer, item: { name: string; count: string | number }, group: string) => AnsiAwareBuffer;
}

/**
 * Pretty Containers API - Access and extend container formatting
 */
export interface PrettyContainersApi {
  /**
   * Get current group definitions for categorizing items
   * Groups determine how items are organized in container displays
   *
   * @returns Read-only array of group definitions
   *
   * @example
   * ```typescript
   * const groups = api.prettyContainers.getFilters();
   * console.log("Available groups:", groups.map(g => g.name));
   * ```
   */
  getFilters(): ReadonlyArray<Readonly<GroupDefinition>>;

  /**
   * Get current transform definitions for styling items
   * Transforms apply colors, links, and formatting to matching items
   *
   * @returns Read-only array of transform definitions
   *
   * @example
   * ```typescript
   * const transforms = api.prettyContainers.getTransforms();
   * console.log(`${transforms.length} transforms registered`);
   * ```
   */
  getTransforms(): ReadonlyArray<Readonly<TransformDefinition>>;

  /**
   * Add a new group definition for categorizing items
   * New groups will appear in container displays
   *
   * @param definition - Group definition with name and filter function
   *
   * @example
   * ```typescript
   * // Add a group for potions
   * api.prettyContainers.addFilter({
   *   name: "mikstury",
   *   filter: (item) => /eliksir|mikstur/.test(item)
   * });
   * ```
   */
  addFilter(definition: GroupDefinition): void;

  /**
   * Add a new transform definition for styling items
   * New transforms will be applied to all items in containers
   *
   * @param definition - Transform definition with transform function
   *
   * @example
   * ```typescript
   * // Highlight potions in green
   * api.prettyContainers.addTransform({
   *   transform: (buffer, item, group) => {
   *     if (/eliksir|mikstur/.test(item.name)) {
   *       buffer.color([0, buffer.length], api.colors.fromHex('#00ff00'));
   *     }
   *     return buffer;
   *   }
   * });
   * ```
   */
  addTransform(definition: TransformDefinition): void;
}

/**
 * Container type for bag assignment
 * - "money" - money container
 * - "gems" - gems container
 * - "food" - food container
 * - "other" - general items container
 * - any type registered with api.containers.registerType()
 */
export type ContainerType = "money" | "gems" | "food" | "other" | (string & {});

/**
 * Options for a plugin-defined container type
 */
export interface ContainerTypeOptions {
  /** Name shown in /pojemnik and /pojemniki (defaults to the type id) */
  label?: string;
  /**
   * Type whose bag is used until the player picks one for this type in /pojemnik
   * (default "other"). May be another registered type.
   */
  fallback?: ContainerType;
}

/**
 * Grammatical forms for a container bag name
 */
export interface ContainerForms {
  /** Nominative form (mianownik) - e.g., "plecak", "torba" */
  mianownik: string;
  /** Genitive form (dopelniacz) - e.g., "plecaka", "torby" */
  dopelniacz: string;
  /** Accusative form (biernik) - e.g., "plecak", "torbe" */
  biernik: string;
  /**
   * Worn on the back or at the belt - address it as `zalozonego ${dopelniacz}`
   * (`zalozonej` for a feminine bag), numbered among the worn ones when several are.
   */
  worn?: boolean;
  /**
   * Which of several same-named bags, when the player carries more than one -
   * address it as `${index}. swojej ${dopelniacz}`. Absent means the first one.
   */
  index?: number;
}

/**
 * Containers API - Put items into and take items from assigned bags
 */
export interface ContainersApi {
  /**
   * Register a plugin container type. It shows up in /pojemnik and /pojemniki next to the
   * built-in ones and uses its fallback type's bag until the player assigns one to it.
   * The player's choice is stored per character. The type is unregistered with the plugin.
   *
   * Pick an id unlikely to clash with other plugins (e.g. prefixed with the plugin name).
   *
   * @param type - Type id, used with getContainer / put / take / inspect
   * @param options - Label and fallback type
   *
   * @example
   * ```typescript
   * // Gems for gem sockets - the "gems" bag unless the player sets another one
   * api.containers.registerType("mc-gem-sockets", { label: "kamienie do gniazd", fallback: "gems" });
   * await api.containers.inspect("mc-gem-sockets", { silent: true });
   * ```
   */
  registerType(type: string, options?: ContainerTypeOptions): void;

  /**
   * Get the assigned bag name for a container type
   *
   * @param type - Container type ("money", "gems", "food", "other")
   * @returns The bag name (e.g., "plecak", "torba", or "2. sakiewka" for the second of several)
   *
   * @example
   * ```typescript
   * const moneyBag = api.containers.getContainer("money");
   * console.log(`Money is stored in: ${moneyBag}`);
   * ```
   */
  getContainer(type: ContainerType): string;

  /**
   * Get grammatical forms for a container type's bag
   * Returns mianownik, dopelniacz, and biernik forms
   *
   * @param type - Container type ("money", "gems", "food", "other")
   * @returns Object with mianownik, dopelniacz, biernik forms, or null if bag is unknown
   *
   * @example
   * ```typescript
   * const forms = api.containers.getContainerForms("other");
   * if (forms) {
   *   console.log(`mianownik: ${forms.mianownik}`);   // "plecak"
   *   console.log(`dopelniacz: ${forms.dopelniacz}`);   // "plecaka"
   *   console.log(`biernik: ${forms.biernik}`);         // "plecak"
   * }
   * ```
   */
  getContainerForms(type: ContainerType): ContainerForms | null;

  /**
   * Put items into a container bag
   * Opens the bag, puts items in, and closes the bag
   *
   * @param type - Container type ("money", "gems", "food", "other")
   * @param item - Item name(s) to put in, comma-separated for multiple
   *
   * @example
   * ```typescript
   * // Put money into money bag
   * api.containers.put("money", "monety");
   *
   * // Put multiple items into other bag
   * api.containers.put("other", "miecz, tarcza");
   * ```
   */
  put(type: ContainerType, item: string): void;

  /**
   * Take items from a container bag
   * Opens the bag, takes items out, and closes the bag
   *
   * @param type - Container type ("money", "gems", "food", "other")
   * @param item - Item name(s) to take out, comma-separated for multiple
   *
   * @example
   * ```typescript
   * // Take money from money bag
   * api.containers.take("money", "monety");
   *
   * // Take multiple items from other bag
   * api.containers.take("other", "miecz, tarcza");
   * ```
   */
  take(type: ContainerType, item: string): void;

  /**
   * Look into a container bag and get its contents
   * Sends "zajrzyj do <bag>" and resolves with the parsed items of the listing.
   * Every listing (inspected or not) is also announced as the "containers.listed" event.
   *
   * @param type - Container type ("money", "gems", "food", "other")
   * @param options.silent - Hide the command echo and the listing line
   * @param options.timeout - Milliseconds to wait for the listing (default 5000)
   * @returns Items in the bag (empty for an empty bag), or null when no listing
   *   arrived in time (bag not carried, no bag assigned)
   *
   * @example
   * ```typescript
   * const gems = await api.containers.inspect("gems", { silent: true });
   * gems?.forEach(item => console.log(item.count, item.name));
   * ```
   */
  inspect(type: ContainerType, options?: { silent?: boolean; timeout?: number }): Promise<{ name: string; count: string | number }[] | null>;

  /**
   * Bag nouns the client can build commands for ("plecak", "torba", "worek", ...),
   * e.g. to offer them in a dropdown.
   */
  listBags(): string[];

  /**
   * Assign a bag to one of this plugin's types, as the player would with /pojemnik.
   * Pass `"2. torba"` for the second of several same bags, or null to go back to
   * the fallback type's bag. The choice is stored per character.
   * @returns false for a bag the client does not know or a type this plugin did not register
   */
  setContainer(type: string, bag: string | null): boolean;

  /**
   * Ready-to-send forms of the type's bag, with pronoun and ordinal:
   * `{ biernik: "swoj plecak", dopelniacz: "swojego plecaka", from: "ze" }`.
   * Null when the type has no known bag.
   *
   * @example
   * ```typescript
   * const box = api.containers.getCommandForms("jubiler-kamienie");
   * if (box) api.command.send(`wez otwarty woreczek ${box.from} ${box.dopelniacz}`);
   * ```
   */
  getCommandForms(type: ContainerType): ContainerCommandForms | null;
}

/** See {@link ContainersApi.getCommandForms} */
export interface ContainerCommandForms {
  /** After otworz / zamknij / ob: "swoj plecak", "2. swoja sakiewke" */
  biernik: string;
  /** After do / z: "swojego plecaka" */
  dopelniacz: string;
  /** Preposition for taking out: "ze" before "swojego", "z" before an ordinal */
  from: 'z' | 'ze';
}

export function createPrettyContainersApi(): PrettyContainersApi {
  return {
    getFilters: () => {
      return getGroupDefinitions();
    },
    getTransforms: () => {
      return getTransformDefinitions();
    },
    addFilter: (definition: GroupDefinition) => {
      addGroupDefinition(definition);
    },
    addTransform: (definition: TransformDefinition) => {
      addTransformDefinition(definition);
    }
  };
}

export function createContainersApi(ctx: PluginApiContext): ContainersApi {
  const containerTypes = new Set<string>();
  // Stored bag choices stay; only the types go
  ctx.onCleanup(() => {
    for (const type of Array.from(containerTypes)) unregisterContainerType(type);
    containerTypes.clear();
  });
  return {
    registerType: (type: string, options?: ContainerTypeOptions) => {
      registerContainerType(type, options);
      containerTypes.add(type);
    },
    getContainer: (type: ContainerType) => {
      return getContainer(type);
    },
    getContainerForms: (type: ContainerType) => {
      return getContainerForms(type);
    },
    put: (type: ContainerType, item: string) => {
      containerAction(ctx.client, type, "put", item);
    },
    take: (type: ContainerType, item: string) => {
      containerAction(ctx.client, type, "take", item);
    },
    inspect: (type: ContainerType, options?: { silent?: boolean; timeout?: number }) => {
      return inspectContainer(ctx.client, type, options);
    },
    listBags: () => listKnownBags(),
    setContainer: (type: string, bag: string | null) => {
      return containerTypes.has(type) && assignContainer(type, bag);
    },
    getCommandForms: (type: ContainerType) => getContainerCommandForms(type)
  };
}
