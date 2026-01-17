import { useState } from "react";
import { useClientEvent } from "../../hooks";

/**
 * WeaponState component - displays weapon drawn/sheathed indicator
 * Shows "Bron: on" or "Bron: off" based on weapon state
 */
export const WeaponState: React.FC = () => {
    const [hasWeapon, setHasWeapon] = useState<boolean | null>(null);

    useClientEvent<boolean>("weapon_state", (state) => {
        setHasWeapon(state);
    });

    if (hasWeapon === null) {
        return null;
    }

    return (
        <span>
            Bron: <span className={hasWeapon ? "weapon-on" : "weapon-off"}>{hasWeapon ? "on" : "off"}</span>
        </span>
    );
};

export default WeaponState;
