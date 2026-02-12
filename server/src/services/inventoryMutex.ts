import type { PoolClient } from 'pg';

const INVENTORY_MUTEX_NAMESPACE = 3101;

const normalizeCharacterIds = (characterIds: number[]): number[] =>
  [...new Set(characterIds)]
    .filter((id) => Number.isInteger(id) && id > 0)
    .sort((a, b) => a - b);

export const lockCharacterInventoryMutexTx = async (
  client: PoolClient,
  characterId: number
): Promise<void> => {
  await client.query(
    'SELECT pg_advisory_xact_lock($1::integer, $2::integer)',
    [INVENTORY_MUTEX_NAMESPACE, characterId]
  );
};

export const lockCharacterInventoryMutexesTx = async (
  client: PoolClient,
  characterIds: number[]
): Promise<void> => {
  const ids = normalizeCharacterIds(characterIds);
  for (const characterId of ids) {
    await lockCharacterInventoryMutexTx(client, characterId);
  }
};

