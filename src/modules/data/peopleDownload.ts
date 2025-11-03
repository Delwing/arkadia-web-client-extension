const PEOPLE_DB_URL = 'https://arkadia-people.delwing.workers.dev/download';

export async function downloadPeopleDatabase(): Promise<ArrayBuffer> {
    const response = await fetch(PEOPLE_DB_URL, {
        cache: 'no-cache',
        headers: {
            'Cache-Control': 'no-cache',
        },
    });

    if (!response.ok) {
        throw new Error(`Failed to download people database (${response.status})`);
    }

    return await response.arrayBuffer();
}
