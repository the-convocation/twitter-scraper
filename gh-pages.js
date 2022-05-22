import { publish } from 'gh-pages';

publish('docs/', (err) => {
  if (err) {
    console.error(err);
  }
});
