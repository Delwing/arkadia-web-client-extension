import type { WeaponEntry, ArmorEntry, ShieldEntry } from '@client/scripts/zlom';

export interface ZlomDbResult {
    bronie: WeaponEntry[];
    tarcze: ShieldEntry[];
    zbroje: ArmorEntry[];
}

export interface ZlomDbWorkerRequest {
    type: 'parse';
    buffer: ArrayBuffer;
}

export interface ZlomDbWorkerSuccess {
    type: 'success';
    payload: ZlomDbResult;
}

export interface ZlomDbWorkerError {
    type: 'error';
    message: string;
}

export type ZlomDbWorkerResponse = ZlomDbWorkerSuccess | ZlomDbWorkerError;
