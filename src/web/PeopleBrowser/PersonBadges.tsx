import React from 'react';
import type { PersonListEntry } from '@client/types/people';

/** The entry's state as small pills: marks first, then where the entry comes from. */
export const PersonBadges: React.FC<{ person: PersonListEntry }> = ({ person }) => {
    const isAlly = person.isAlly && !person.isEnemy;
    return (
        <>
            {person.isEnemy && (
                <span className="people-browser__badge people-browser__badge--enemy" title="Oznaczony jako wróg">wróg</span>
            )}
            {isAlly && (
                <span className="people-browser__badge people-browser__badge--ally" title="Oznaczony jako sojusznik">sojusznik</span>
            )}
            {person.source === 'local' && (
                <span className="people-browser__badge people-browser__badge--local" title="Dodano lokalnie">lokalna</span>
            )}
            {person.source === 'edited' && (
                <span
                    className="people-browser__badge people-browser__badge--edited"
                    title={person.originalEntry
                        ? `Oryginał: ${person.originalEntry.name} (${person.originalEntry.guild}) - ${person.originalEntry.description}`
                        : 'Edytowano lokalnie'}
                >
                    zmieniona
                </span>
            )}
            {person.ignored && (
                <span className="people-browser__badge people-browser__badge--ignored" title="Ignorowana: nie tworzy triggerów">ignorowana</span>
            )}
        </>
    );
};
