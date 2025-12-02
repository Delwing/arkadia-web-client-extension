import Client from "../Client";

export default function initLanguageTeacher(client: Client) {
    const tag = "languageTeacher";

    // Pattern: "Name chce cie uczyc mowic po/w jezyku languageName."
    // Language name can be complex (multiple words)
    // Supports both "mowic po X" and "mowic w jezyku X" formats
    const pattern = /^(.+) chce cie uczyc mowic (?:po|w)(?: jezyku)? (.+)\.$/;

    client.Triggers.registerTrigger(pattern, (line, matches) => {
        if (!matches || !matches[1] || !matches[2]) return line;

        const teacherName = matches[1];
        const teacherNameLower = teacherName.toLowerCase();

        // Get objects on location to find the teacher
        const objects = client.ObjectManager.getObjectsOnLocation();

        // Find the teacher by matching name or description (first 3 words), case-insensitive
        const teacherObj = objects.find(obj => {
            if (!obj.desc) return false;
            const descLower = obj.desc.toLowerCase();

            // Check exact match
            if (descLower === teacherNameLower) return true;

            // Check first 3 words of description
            const descWords = descLower.split(/\s+/).slice(0, 3).join(' ');
            const nameWords = teacherNameLower.split(/\s+/).slice(0, 3).join(' ');
            return descWords === nameWords || descLower.startsWith(teacherNameLower);
        });

        if (teacherObj) {
            const command = `jucz sie jezyka od ob_${teacherObj.num}`;
            const displayName = teacherObj.desc || teacherName;
            client.FunctionalBind.set(`jucz sie jezyka od ${displayName}`, () => client.sendCommand(command));
        }

        return line;
    }, tag);
}
