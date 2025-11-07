export const stripPolishCharacters = (input: string): string => {
    const map: Record<string, string> = {
        'ą': 'a',
        'ć': 'c',
        'ę': 'e',
        'ł': 'l',
        'ń': 'n',
        'ó': 'o',
        'ś': 's',
        'ż': 'z',
        'ź': 'z',
        'Ą': 'A',
        'Ć': 'C',
        'Ę': 'E',
        'Ł': 'L',
        'Ń': 'N',
        'Ó': 'O',
        'Ś': 'S',
        'Ż': 'Z',
        'Ź': 'Z',
    };
    return Array.from(input).map(ch => map[ch] || ch).join('');
};
