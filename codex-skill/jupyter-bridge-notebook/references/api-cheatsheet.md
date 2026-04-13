# API Cheatsheet

## Read

- `GET /status`
- `GET /servers`
- `GET /compliance`
- `GET /notebook`
- `GET /cells`
- `GET /cell`
- `GET /context`
- `GET /kernel`
- `GET /output`
- `GET /execution/state`
- `GET /debug/state`

## Cell CRUD

- `POST /cell/insert`
- `POST /cell/append`
- `POST /cell/update`
- `POST /cell/delete`
- `POST /cell/move`
- `POST /cell/duplicate`
- `POST /cell/select`
- `POST /cell/reveal`
- `POST /cell/replaceOutputs`
- `POST /cell/clearOutputs`
- `POST /workflow/updateAndRun`
- `POST /workflow/insertAndRun`

## Run

- `POST /run/current`
- `POST /run/cell`
- `POST /run/above`
- `POST /run/below`
- `POST /run/all`
- `POST /run/selectedAndAdvance`
- `POST /run/precedents`
- `POST /run/dependents`

## Debug

- `POST /debug/cell`
- `POST /debug/continue`
- `POST /debug/stepOver`
- `POST /debug/stop`

## Kernel and Notebook

- `POST /kernel/interrupt`
- `POST /kernel/restart`
- `POST /kernel/restartAndRunAll`
- `POST /kernel/restartAndRunToCell`
- `POST /kernel/select`
- `POST /notebook/save`
- `POST /notebook/revert`
- `POST /notebook/closeEditor`
- `POST /notebook/focus`

## Viewers

- `POST /viewer/variables/open`
- `POST /viewer/data/open`
- `POST /viewer/output/open`
- `POST /interpreter/select`
