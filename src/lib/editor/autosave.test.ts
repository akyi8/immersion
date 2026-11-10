import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Autosave } from './autosave.ts';

/** A file on disk and an editor over it, with a save delay too long to fire in a test. */
function desk(text: string) {
  const file = { text, writes: 0, failing: false, missing: false };
  const editor = { doc: text };
  const saver: Autosave = new Autosave({
    read: async () => {
      if (file.missing) throw new Error('gone');
      return file.text;
    },
    write: async (next) => {
      if (file.failing) throw new Error('disk full');
      file.text = next;
      file.missing = false;
      file.writes++;
    },
    doc: () => editor.doc,
    show: (next) => {
      editor.doc = next;
      // The real editor announces every change, including ones the saver made.
      saver.typed();
    },
    delay: 60_000,
    retry: 60_000,
  });
  saver.start(text);
  const type = (next: string) => {
    editor.doc = next;
    saver.typed();
  };
  return { file, editor, saver, type };
}

const page = 'one\n\ntwo\n\nthree\n';

test('typing is saved', async () => {
  const d = desk(page);
  d.type(page + 'four\n');
  assert.equal(d.saver.status, 'saving');
  await d.saver.save();
  assert.equal(d.file.text, page + 'four\n');
  assert.equal(d.saver.status, 'saved');
  d.saver.stop();
});

test('nothing typed means nothing written', async () => {
  const d = desk(page);
  await d.saver.save();
  assert.equal(d.file.writes, 0);
});

test('an outside change with nothing unsaved is shown', async () => {
  const d = desk(page);
  d.file.text = page + 'theirs\n';
  assert.equal(await d.saver.changedElsewhere(), true);
  assert.equal(d.editor.doc, page + 'theirs\n');
  assert.equal(d.saver.status, 'saved');
  await d.saver.save();
  assert.equal(d.file.writes, 0);
  d.saver.stop();
});

test('an outside change to another paragraph joins unsaved typing', async () => {
  const d = desk(page);
  d.type(page.replace('three', 'THREE'));
  d.file.text = page.replace('one', 'ONE');
  await d.saver.changedElsewhere();
  assert.equal(d.saver.conflict, null);
  assert.equal(d.editor.doc, 'ONE\n\ntwo\n\nTHREE\n');
  await d.saver.save();
  assert.equal(d.file.text, 'ONE\n\ntwo\n\nTHREE\n');
  d.saver.stop();
});

test('an outside change nobody announced is still never written over', async () => {
  const d = desk(page);
  d.type(page.replace('three', 'THREE'));
  d.file.text = page.replace('one', 'ONE');
  await d.saver.save();
  assert.equal(d.file.text, 'ONE\n\ntwo\n\nTHREE\n');
  assert.equal(d.editor.doc, 'ONE\n\ntwo\n\nTHREE\n');
  d.saver.stop();
});

test('a clash holds every save until the writer chooses', async () => {
  const d = desk(page);
  d.type(page.replace('two', 'mine'));
  d.file.text = page.replace('two', 'theirs');
  await d.saver.changedElsewhere();
  assert.equal(d.saver.conflict, page.replace('two', 'theirs'));
  await d.saver.save();
  d.type(page.replace('two', 'mine again'));
  await d.saver.save();
  assert.equal(d.file.text, page.replace('two', 'theirs'));
  assert.equal(d.file.writes, 0);
  d.saver.stop();
});

test('choosing the other version shows it and leaves the disk alone', async () => {
  const d = desk(page);
  d.type(page.replace('two', 'mine'));
  d.file.text = page.replace('two', 'theirs');
  await d.saver.changedElsewhere();
  d.saver.takeTheirs();
  assert.equal(d.editor.doc, page.replace('two', 'theirs'));
  assert.equal(d.saver.status, 'saved');
  await d.saver.save();
  assert.equal(d.file.text, page.replace('two', 'theirs'));
  assert.equal(d.file.writes, 0);
  d.saver.stop();
});

test('keeping mine writes it', async () => {
  const d = desk(page);
  d.type(page.replace('two', 'mine'));
  d.file.text = page.replace('two', 'theirs');
  await d.saver.changedElsewhere();
  await d.saver.keepMine();
  assert.equal(d.file.text, page.replace('two', 'mine'));
  assert.equal(d.saver.conflict, null);
  assert.equal(d.saver.status, 'saved');
});

test('closing the page with a clash open keeps what the writer typed', async () => {
  const d = desk(page);
  d.type(page.replace('two', 'mine'));
  d.file.text = page.replace('two', 'theirs');
  await d.saver.changedElsewhere();
  await d.saver.save(true);
  assert.equal(d.file.text, page.replace('two', 'mine'));
});

test('a failed save keeps the newest typing and saves it on the next try', async () => {
  const d = desk(page);
  d.file.failing = true;
  d.type(page + 'a\n');
  await d.saver.save();
  assert.equal(d.saver.status, 'error');
  assert.equal(d.saver.problem, 'disk full');
  d.type(page + 'a\nb\n');
  d.file.failing = false;
  await d.saver.save();
  assert.equal(d.file.text, page + 'a\nb\n');
  assert.equal(d.saver.status, 'saved');
  d.saver.stop();
});

test("the watcher's echo of the app's own save is ignored", async () => {
  const d = desk(page);
  d.type(page + 'a\n');
  await d.saver.save();
  assert.equal(await d.saver.changedElsewhere(), false);
  assert.equal(d.saver.conflict, null);
});

test('a file that went missing is written again', async () => {
  const d = desk(page);
  d.file.missing = true;
  d.type(page + 'a\n');
  await d.saver.save();
  assert.equal(d.file.text, page + 'a\n');
  assert.equal(d.file.writes, 1);
});
