import instantsearch from 'instantsearch.js/es';
import algoliaHelper from 'algoliasearch-helper';
const { SearchParameters, SearchResults } = algoliaHelper;
import { warn } from './warn';

export const createInstantSearch = ({ searchClient, indexName, options }) => {
  const search = instantsearch({
    ...options,
    searchClient,
    indexName,
  });

  search._isSsr = true;

  // main API for SSR, called in asyncData of a root component which contains instantsearch
  search.findResultsState = params => {
    search.helper = algoliaHelper(searchClient, indexName, {
      ...params,
      // parameters set by default
      highlightPreTag: '__ais-highlight__',
      highlightPostTag: '__/ais-highlight__',
    });

    return search.helper.searchOnce().then(({ content: lastResults }) => {
      // The search instance needs to act as if this was a regular `search`
      // but return a promise, since that is the interface of `asyncData`
      search.helper.lastResults = lastResults;
    });
  };

  // make sure correct data is available in each widget's state
  // called in widget mixin
  search.__forceRender = widget => {
    if (!search.helper) {
      warn(
        'You did not call `instantsearch.findResultsState`, which is required for ais-instant-search-ssr'
      );
      return;
    }

    widget.init({
      state: search.helper.lastResults._state,
      helper: search.helper,
      templatesConfig: {},
      createURL: () => '#',
      onHistoryChange: () => {},
      instantSearchInstance: search,
    });

    widget.render({
      state: search.helper.lastResults._state,
      results: search.helper.lastResults,
      helper: search.helper,
      templatesConfig: {},
      // TODO: use memory or real router
      createURL: () => '#',
      instantSearchInstance: search,
      searchMetadata: {
        isSearchStalled: false,
      },
    });
  };

  search.getState = () => {
    if (search.helper === null || !search.helper.lastResults) {
      warn(
        'You called `getState` with an instance which has not searched yet, use `findResultsState`'
      );
      return undefined;
    }
    return {
      lastResults: JSON.parse(JSON.stringify(search.helper.lastResults)),
    };
  };

  // called before app mounts on client
  search.hydrate = instantSearchState => {
    if (!instantSearchState || !instantSearchState.lastResults) {
      warn(
        'You did not pass the result of `findResultsState` to `hydrate`, which is required'
      );
      return;
    }
    const { lastResults } = instantSearchState;
    search.searchParameters = lastResults._state;
    search.helper = algoliaHelper(searchClient, indexName, lastResults._state);
    search.helper.lastResults = new SearchResults(
      new SearchParameters(lastResults._state),
      lastResults._rawResults
    );
  };

  // put this in the user's root Vue instance
  // we can then reuse that InstantSearch instance seamlessly from `ais-ssr`
  const rootMixin = {
    provide() {
      return {
        // should be possible to configure this with {camelcase: ['error', {allow: ['^\\$_']}]}
        // but that didn't work
        // eslint-disable-next-line camelcase
        $_ais: search,
      };
    },
  };

  return {
    instantsearch: search,
    rootMixin,
  };
};
