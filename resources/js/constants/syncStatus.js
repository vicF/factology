// resources/js/constants/syncStatus.js

/**
 * Sync status of a local record.
 *
 *  SYNCED      – record matches server state
 *  LOCAL       – pending local changes that need to be pushed
 *  CONFLICT    – both local and server versions changed since last sync
 *  SERVER_ONLY – pulled from server, not modified locally
 *  LOCAL_ONLY  – created locally, never pushed to any server
 */
export const SYNC_STATUS = {
  SYNCED:      'synced',
  LOCAL:       'local',
  CONFLICT:    'conflict',
  SERVER_ONLY: 'server_only',
  LOCAL_ONLY:  'local_only',
};

/**
 * Change operations tracked in the pendingChanges queue.
 */
export const CHANGE_OP = {
  INSERT: 'insert',
  UPDATE: 'update',
  DELETE: 'delete',
};
