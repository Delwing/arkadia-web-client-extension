export type DirectionKey =
    | 'n'
    | 's'
    | 'w'
    | 'e'
    | 'nw'
    | 'ne'
    | 'sw'
    | 'se'
    | 'u'
    | 'd'
    | 'special';

export interface KeyBind {
    key: string;
    ctrl?: boolean;
    alt?: boolean;
    shift?: boolean;
}

export interface CustomKeyBind extends KeyBind {
    command: string;
}

export type DirectionBindMap = Partial<Record<DirectionKey, KeyBind>>;

export interface BindSettings {
    main?: KeyBind;
    lamp?: KeyBind;
    attack?: KeyBind;
    support?: KeyBind;
    moveMode?: KeyBind;
    directions?: DirectionBindMap;
    custom?: CustomKeyBind[];
    temp?: KeyBind[];
}
