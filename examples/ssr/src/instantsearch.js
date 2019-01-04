import instantsearch from 'instantsearch.js/es/index';
import algoliaHelper, {
  SearchParameters,
  SearchResults,
} from 'algoliasearch-helper';

export const createInstantSearch = ({ searchClient, indexName, options }) => {
  const search = instantsearch({
    searchClient,
    indexName,
    ...options,
  });

  search._isSsr = true;

  // main API for SSR, called in asyncData of a root component which contains instantsearch
  search.findResultsState = async params => {
    search.helper = algoliaHelper(searchClient, indexName, {
      // parameters set by default
      highlightPreTag: '__ais-highlight__',
      highlightPostTag: '__/ais-highlight__',
      ...params,
    });

    const { content: lastResults } = await search.helper.searchOnce();

    // TODO: maybe use the life cycle version?
    search.helper.lastResults = lastResults;

    return {
      ais: {
        lastResults: JSON.parse(JSON.stringify(lastResults)),
      },
    };
  };

  // make sure correct data is available in each widget's state
  // called in widget mixin
  search.__forceRender = widget => {
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

  // called before app mounts on client
  // reads from ALGOLIA_STATE & makes sure the results are read when rendering
  search.hydrate = () => {
    if (window.__ALGOLIA_STATE__) {
      const { lastResults } = window.__ALGOLIA_STATE__;
      search.searchParameters = lastResults._state;
      search.helper = algoliaHelper(
        searchClient,
        indexName,
        lastResults._state
      );
      search.helper.lastResults = new SearchResults(
        new SearchParameters(lastResults._state),
        lastResults._rawResults
      );

      delete window.__ALGOLIA_STATE__;
    }
  };

  // receives components & context
  // finds all components which have a call to `instantsearch.calledInAsyncDataPrefetch`
  // keeps only one of those and puts it on global context
  // (this global context is used to be put on window.ALGOLIA_STATE)
  search.findRoot = ({ components, context }) => {
    const aisComponents = components.filter(comp => comp && comp.ais);
    if (aisComponents.length > 1) {
      throw new Error('only one InstantSearch instance is allowed');
    }

    if (aisComponents[0]) {
      context.ais = { ...aisComponents[0].ais };
    }
  };

  // put this in the user's root Vue instance
  // we can then reuse that InstantSearch instance seamlessly from `ais-ssr`
  const rootMixin = {
    provide() {
      return {
        $_ais: search,
      };
    },
  };

  return {
    instantsearch: search,
    rootMixin,
  };
};
