package api

import "strconv"

// CheckpointsPath is the checkpoint collection endpoint:
// GET /api/checkpoints lists every checkpoint newest-first as
// { checkpoints } (snapshot-list.ts); POST /api/checkpoints creates a
// manual checkpoint and returns it as the bare 201 body
// (snapshot-create.ts, editor role). Both answer 501 { error } when no
// checkpoint adapter is configured.
const CheckpointsPath = "/api/checkpoints"

// CheckpointPath returns the API path of one checkpoint —
// DELETE /api/checkpoints/:version (snapshot-delete.ts, admin role).
func CheckpointPath(version int) string {
	return CheckpointsPath + "/" + strconv.Itoa(version)
}

// CheckpointRestorePath returns the restore endpoint of one checkpoint —
// POST /api/checkpoints/:version/restore (snapshot-restore.ts, admin role).
func CheckpointRestorePath(version int) string {
	return CheckpointPath(version) + "/restore"
}

// Checkpoint mirrors CheckpointInfo in packages/persistence/src/migrations.ts:
// a point-in-time marker of the content store. Name is null when the
// checkpoint was created without one; Trigger is manual | pre-migration |
// pre-restore | pre-import.
type Checkpoint struct {
	ID        int     `json:"id"`
	Version   int     `json:"version"`
	Name      *string `json:"name"`
	Trigger   string  `json:"trigger"`
	CreatedAt string  `json:"createdAt"`
}

// CheckpointList is the snapshot-list.ts 200 response body.
type CheckpointList struct {
	Checkpoints []Checkpoint `json:"checkpoints"`
}

// CreateCheckpointRequest is the snapshot-create.ts request body — the
// handler reads only a string name; absent means unnamed.
type CreateCheckpointRequest struct {
	Name string `json:"name,omitempty"`
}

// RestoreCheckpointResult is the snapshot-restore.ts 200 body:
// { restored, message: "Restored from checkpoint vN" }. An unknown version
// is its 404 { error }; any other restore failure its 500 { error }.
type RestoreCheckpointResult struct {
	Restored Checkpoint `json:"restored"`
	Message  string     `json:"message"`
}

// DeleteCheckpointResult is the snapshot-delete.ts 200 body:
// { deleted: true, version }; an unknown version is its 404 { error }.
type DeleteCheckpointResult struct {
	Deleted bool `json:"deleted"`
	Version int  `json:"version"`
}

// CreateCheckpoint creates a manual checkpoint via POST /api/checkpoints.
func (c *Client) CreateCheckpoint(req CreateCheckpointRequest) (*Checkpoint, error) {
	var checkpoint Checkpoint
	if err := c.Post(CheckpointsPath, req, &checkpoint); err != nil {
		return nil, err
	}
	return &checkpoint, nil
}

// ListCheckpoints fetches all checkpoints via GET /api/checkpoints.
func (c *Client) ListCheckpoints() (*CheckpointList, error) {
	var list CheckpointList
	if err := c.Get(CheckpointsPath, &list); err != nil {
		return nil, err
	}
	return &list, nil
}

// RestoreCheckpoint rewinds the content store to a checkpoint via
// POST /api/checkpoints/:version/restore.
func (c *Client) RestoreCheckpoint(version int) (*RestoreCheckpointResult, error) {
	var result RestoreCheckpointResult
	if err := c.Post(CheckpointRestorePath(version), nil, &result); err != nil {
		return nil, err
	}
	return &result, nil
}

// DeleteCheckpoint deletes a checkpoint via DELETE /api/checkpoints/:version.
func (c *Client) DeleteCheckpoint(version int) (*DeleteCheckpointResult, error) {
	var result DeleteCheckpointResult
	if err := c.Delete(CheckpointPath(version), &result); err != nil {
		return nil, err
	}
	return &result, nil
}
