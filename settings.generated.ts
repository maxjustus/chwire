// AUTO-GENERATED from ClickHouse v26.11.1.1-new Settings.cpp
// Run: make update-settings
// Do not edit manually.

/**
 * Typed ClickHouse settings interface.
 * Generated from official ClickHouse source code.
 */
export interface ClickHouseSettings {
  /**
   * The number of keys at which the adaptive aggregator freezes a thread's local hash table (see `enable_adaptive_aggregator`). Smaller values keep the frozen tables cache-resident, larger values let them absorb more of the frequent keys. 0 freezes the tables at the first opportunity, which makes the algorithm behave like pure sharding by the key hash: every key is routed by its hash and aggregated by a single owner, just deferred to the merge phase instead of exchanged between threads during the scan.
   * @since 26.9
   */
  adaptive_aggregator_freeze_threshold?: bigint;

  /**
   * The memory size at which the adaptive aggregator freezes a thread's local hash table (see `enable_adaptive_aggregator`). A table freezes at whichever of this and `adaptive_aggregator_freeze_threshold` is reached first. The size is the local table's own allocated bytes (its hash-table buffer plus its arenas), checked between blocks. The byte bound matters when the keys or the aggregation states are wide: the key-count threshold alone would let such tables outgrow the CPU caches. At the default, tables of ordinary key and state widths keep freezing by the key count. 0 disables the byte bound, so the key-count threshold alone decides.
   * @since 26.10
   */
  adaptive_aggregator_freeze_threshold_bytes?: bigint;

  /**
   * Write add http CORS header.
   */
  add_http_cors_header?: boolean;

  /**
   * An additional filter expression to apply to the result of `SELECT` query. This setting is not applied to any subquery. **Example** ```sql INSERT INTO table_1 VALUES (1, 'a'), (2, 'bb'), (3, 'ccc'), (4, 'dddd'); SElECT * FROM table_1; ``` ```response ┌─x─┬─y────┐ │ 1 │ a │ │ 2 │ bb │ │ 3 │ ccc │ │ 4 │ dddd │ └───┴──────┘ ``` ```sql SELECT * FROM table_1 SETTINGS additional_result_filter = 'x != 2' ``` ```response ┌─x─┬─y────┐ │ 1 │ a │ │ 3 │ ccc │ │ 4 │ dddd │ └───┴──────┘ ```
   */
  additional_result_filter?: string;

  /**
   * An additional filter expression that is applied after reading from the specified table. **Example** ```sql INSERT INTO table_1 VALUES (1, 'a'), (2, 'bb'), (3, 'ccc'), (4, 'dddd'); SELECT * FROM table_1; ``` ```response ┌─x─┬─y────┐ │ 1 │ a │ │ 2 │ bb │ │ 3 │ ccc │ │ 4 │ dddd │ └───┴──────┘ ``` ```sql SELECT * FROM table_1 SETTINGS additional_table_filters = {'table_1': 'x != 2'} ``` ```response ┌─x─┬─y────┐ │ 1 │ a │ │ 3 │ ccc │ │ 4 │ dddd │ └───┴──────┘ ``` Filters keyed on a table read through a view with `SQL SECURITY DEFINER` or `NONE` are not applied inside the view.
   */
  additional_table_filters?: string;

  /**
   * How the input formats read columns of the `AggregateFunction` type. Possible values: - `state` — the serialized state of the aggregate function, as the output formats write it (the default). - `value` — a value of the argument of the aggregate function, or a tuple of the arguments if there are several of them. The value is aggregated to form the state. - `array` — an array of values, as described in the `value` option above. All elements of the array are aggregated to form the state. In the `value` and `array` modes the format reads the column as if it had the type of the values: `T` for `AggregateFunction(f, T)`, `Tuple(T1, T2)` for `AggregateFunction(f, T1, T2)`, or `Array` of it in the `array` mode. The values are written in the representation the format uses for that type: a number or a string in a text format, a JSON array in the JSON formats, the binary encoding of the type in `RowBinary` or `Native`, a column of that type in `Parquet`, and so on. This applies to every input format, and also to `AggregateFunction` nested in `Array`, `Tuple` or `Map`. **Examples** For a table with structure: ```sql CREATE TABLE example ( user_id UInt64, avg_session_length AggregateFunction(avg, UInt32) ); ``` With `aggregate_function_input_format = 'value'`: ```sql INSERT INTO example FORMAT CSV 123,456 ``` ```sql INSERT INTO example FORMAT JSONEachRow {"user_id": 123, "avg_session_length": 456} ``` With `aggregate_function_input_format = 'array'`: ```sql INSERT INTO example FORMAT CSV 123,"[456,789,101]" ``` ```sql INSERT INTO example FORMAT JSONEachRow {"user_id": 123, "avg_session_length": [456, 789, 101]} ``` Note: The `value` and `array` formats are slower than the default `state` format as they require creating and aggregating values during insertion.
   * @since 26.1
   */
  aggregate_function_input_format?: "state" | "value" | "array";

  /**
   * Enables or disables rewriting all aggregate functions in a query, adding [-OrNull](/reference/functions/aggregate-functions/combinators#-ornull) suffix to them. Enable it for SQL standard compatibility. It is implemented via query rewrite (similar to [count_distinct_implementation](#count_distinct_implementation) setting) to get consistent results for distributed queries. Possible values: - 0 — Disabled. - 1 — Enabled. **Example** Consider the following query with aggregate functions: ```sql SELECT SUM(-1), MAX(0) FROM system.one WHERE 0; ``` With `aggregate_functions_null_for_empty = 0` it would produce: ```text ┌─SUM(-1)─┬─MAX(0)─┐ │ 0 │ 0 │ └─────────┴────────┘ ``` With `aggregate_functions_null_for_empty = 1` the result would be: ```text ┌─SUMOrNull(-1)─┬─MAXOrNull(0)─┐ │ NULL │ NULL │ └───────────────┴──────────────┘ ```
   */
  aggregate_functions_null_for_empty?: boolean;

  /**
   * Maximal size of block in bytes accumulated during aggregation in order of primary key. Lower block size allows to parallelize more final merge stage of aggregation.
   */
  aggregation_in_order_max_block_bytes?: bigint;

  /**
   * Number of threads to use for merge intermediate aggregation results in memory efficient mode. When bigger, then more memory is consumed. 0 means - same as 'max_threads'.
   */
  aggregation_memory_efficient_merge_threads?: bigint;

  /**
   * If false (default), AI functions refuse to use a named-collection `endpoint` that would send prompts and API keys over an unencrypted connection to a remote host: any non-HTTPS endpoint whose host is not loopback is rejected with an exception. Loopback endpoints (e.g. a local `http://localhost` model server) are always allowed. Set to true to permit plaintext `http://` endpoints on remote hosts.
   * @since 26.9
   */
  ai_function_allow_insecure_endpoint?: boolean;

  /**
   * Name of the named collection used by the embedding functions (`aiEmbed`, `aiSimilarity`) when the call does not pass `credentials` in its parameter map. Empty means no default: such calls must pass `credentials` explicitly. These functions take `model` as a required positional argument, not from the named collection. Kept separate from `ai_function_text_default_credentials` because an embeddings endpoint differs from a chat one.
   * @since 26.8
   */
  ai_function_embedding_default_credentials?: string;

  /**
   * Maximum number of texts to include in a single HTTP request made by the embedding functions (`aiEmbed`, `aiSimilarity`). Texts are grouped into batches of this size to reduce API call overhead. For example, 500 unique texts with a batch size of 100 result in 5 HTTP requests.
   * @since 26.7
   */
  ai_function_embedding_max_batch_size?: bigint;

  /**
   * Maximum number of HTTP requests that AI functions may dispatch per query. 0 (default) disables the limit. Enforced independently by each server and query fragment: within one execution context it is an exact cap shared by every AI function, block, and thread there, but a distributed query (across shards or parallel-replica fragments) may dispatch up to this many requests per shard/fragment. It must be set in the top-level query - a sub-query `SETTINGS` override is ignored.
   * @since 26.5
   */
  ai_function_max_api_calls_per_query?: bigint;

  /**
   * Maximum total input (prompt) tokens across all AI function API calls in a single query. 0 (default) disables the limit. Tracked cumulatively from provider responses. Note that this limit may be exceeded by up to one call's worth of input tokens per in-flight request, since a call's input tokens are not known until its response arrives. Like the other AI quotas, it is enforced per server / query fragment, not summed across a distributed query, and must be set in the top-level query - a sub-query `SETTINGS` override is ignored. This limit is only enforced for providers that report a `usage` object in their response (OpenAI, Anthropic, vLLM). Providers that omit token usage (notably HuggingFace TEI) cause the counter to stay at 0 — use `ai_function_max_api_calls_per_query` instead to bound such calls.
   * @since 26.5
   */
  ai_function_max_input_tokens_per_query?: bigint;

  /**
   * Maximum total output (completion) tokens across all AI function API calls in a single query. 0 (default) disables the limit. Tracked cumulatively from provider responses. Note that this limit may be exceeded by up to one call's worth of output tokens per in-flight request, since a call's output tokens are not known until its response arrives. Like the other AI quotas, it is enforced per server / query fragment, not summed across a distributed query, and must be set in the top-level query - a sub-query `SETTINGS` override is ignored. This limit is only enforced for providers that report a `usage` object in their response (OpenAI, Anthropic, vLLM). It does not apply to the embedding functions (`aiEmbed`, `aiSimilarity`), which never produce output tokens.
   * @since 26.5
   */
  ai_function_max_output_tokens_per_query?: bigint;

  /**
   * Maximum number of retry attempts for transient errors per individual API request. Each retry uses exponential backoff starting from `ai_function_retry_initial_delay_ms`.
   * @since 26.5
   */
  ai_function_max_retries?: bigint;

  /**
   * Timeout in seconds for individual HTTP requests made by AI functions (AI chat completions and embedding API calls). If a request does not complete within this time, it is considered failed and may be retried according to `ai_function_max_retries`.
   * @since 26.5
   */
  ai_function_request_timeout_sec?: bigint;

  /**
   * Initial delay in milliseconds before the first retry of a failed AI function API request. The delay doubles on each subsequent attempt (exponential backoff). For example, with default settings: 1000ms, 2000ms, 4000ms.
   * @since 26.5
   */
  ai_function_retry_initial_delay_ms?: bigint;

  /**
   * Name of the named collection used by the text AI functions (`aiGenerate`, `aiClassify`, `aiFilter`, `aiExtract`, `aiTranslate`, `aiRedact`) when the call does not pass `credentials` in its parameter map. Empty means no default: such calls must pass `credentials` explicitly. A chat-completions endpoint differs from an embeddings one, so this is separate from `ai_function_embedding_default_credentials`.
   * @since 26.8
   */
  ai_function_text_default_credentials?: string;

  /**
   * If true (default), an AI function call that fails permanently after exhausting all retries aborts the query with an exception. If false, the failed row receives the default value for the column type (empty string for String) and processing continues.
   * @since 26.5
   */
  ai_function_throw_on_error?: boolean;

  /**
   * If true (default), exceeding an AI function quota limit (`ai_function_max_input_tokens_per_query`, `ai_function_max_output_tokens_per_query`, or `ai_function_max_api_calls_per_query`) aborts the query with an exception. All three limits are disabled by default, so this has no effect until one of them is set. If false, remaining rows receive the default value for the column type (empty string for String). Like the quota limits, this must be set in the top-level query - a sub-query `SETTINGS` override is ignored.
   * @since 26.5
   */
  ai_function_throw_on_quota_exceeded?: boolean;

  /**
   * Enable independent aggregation of partitions on separate threads when partition key suits group by key. Beneficial when number of partitions close to number of cores and partitions have roughly the same size. Heuristics in `ReadFromMergeTree` automatically disable the optimization for unfavorable layouts (too few partitions, too many partitions, or significantly skewed partition sizes); see `force_aggregate_partitions_independently` to bypass those checks.
   */
  allow_aggregate_partitions_independently?: boolean;

  /**
   * File/S3 engines/table function will parse paths with '::' as `<archive> :: <file>` if the archive has correct extension.
   */
  allow_archive_path_syntax?: boolean;

  /**
   * Use background I/O pool to read from MergeTree tables. This setting may increase performance for I/O bound queries
   */
  allow_asynchronous_read_from_io_pool_for_merge_tree?: boolean;

  /**
   * Allow executing a `JOIN` with an arbitrary `ON` condition, one with no equality between the joined tables, as a [block nested loop join](/reference/statements/select/join#join-with-an-arbitrary-on-condition). It examines every pair of rows, which costs the product of the two tables' row counts. The operator is the last resort of join planning, reached only when no [`join_algorithm`](/reference/settings/session-settings/join#join_algorithm) can execute the condition, so it is not selected through that setting. When the setting is disabled, a query that reaches the operator is rejected with `INVALID_JOIN_ON_EXPRESSION` while it is being planned. Possible values: - 0 — Reject such a query. - 1 — Execute it as a block nested loop join (default).
   * @since 26.11
   */
  allow_block_nested_loop_join?: boolean;

  /**
   * When enabled, ClickHouse will calculate the size of files required for each subcolumn reading for better task and block sizes calculation.
   * @since 26.4
   */
  allow_calculating_subcolumns_sizes_for_merge_tree_reading?: boolean;

  /**
   * If it's enabled, in hedged requests we can start new connection until receiving first data packet even if we have already made some progress (but progress haven't updated for `receive_data_timeout` timeout), otherwise we disable changing replica after the first time we made progress.
   */
  allow_changing_replica_until_first_data_packet?: boolean;

  /**
   * Allow to execute correlated subqueries.
   * @since 26.10
   */
  allow_correlated_subqueries?: boolean;

  /**
   * Allow CREATE INDEX query without TYPE. Query will be ignored. Made for SQL compatibility tests.
   */
  allow_create_index_without_type?: boolean;

  /**
   * Enable parallel per-partition pre-deduplication of the subquery result when building the set for `IN (subquery)`, when the partition expression of the subquery's `MergeTree` table is a deterministic function of the subquery output columns. Each partition is read through a separate stream and deduplicated independently, so the single set-filling transform only hashes unique rows. Not applied with `FINAL`, parallel replicas, or `GLOBAL IN`. The optimization requests the per-partition read itself only when the data has more than one partition and the largest partition holds at most twice the rows of the average partition (see [force_creating_set_partitions_independently](#force_creating_set_partitions_independently) to bypass the skew check); when the streams are already partition-disjoint because another per-partition feature split them (for example per-partition `LIMIT BY`), the pre-deduplication is applied regardless, since the read layout is already fixed. While the set is being built, the per-stream deduplication tables together hold roughly one extra copy of the unique keys.
   * @since 26.9
   */
  allow_creating_set_partitions_independently?: boolean;

  /**
   * Enable custom error code in function throwIf(). If true, thrown exceptions may have unexpected error codes.
   */
  allow_custom_error_code_in_throwif?: boolean;

  /**
   * Allow database engine `DataLakeCatalog` with `catalog_type = 'glue'` Cloud default value: `1`.
   * @since 26.10
   */
  allow_database_glue_catalog?: boolean;

  /**
   * Allow database engine `DataLakeCatalog` with `catalog_type = 'iceberg'` Cloud default value: `1`.
   * @since 26.10
   */
  allow_database_iceberg?: boolean;

  /**
   * Allow database engine `DataLakeCatalog` with `catalog_type = 'unity'` Cloud default value: `1`.
   * @since 26.10
   */
  allow_database_unity_catalog?: boolean;

  /**
   * If it is set to true, then a user is allowed to executed DDL queries.
   */
  allow_ddl?: boolean;

  /**
   * Allow the `delta-kernel-rs` implementation for reading Delta Lake tables.
   * @since 26.9
   */
  allow_delta_kernel_rs?: boolean;

  /**
   * Allow creating a new DeltaLake table using delta-kernel-rs or registering an existing one into a catalog. Creating a partitioned table (`PARTITION BY`) is not supported yet. In a `DataLakeCatalog` database the table is registered with its Delta schema, so declared ClickHouse types that map to a wider Delta type (e.g. `UInt8` -> `short`, `FixedString(N)` -> `string`) are read back as the Delta-mapped type rather than the declared one.
   * @since 26.10
   */
  allow_delta_lake_create_table?: boolean;

  /**
   * Enables delta-kernel writes feature.
   * @since 26.10
   */
  allow_delta_lake_writes?: boolean;

  /**
   * Allow to create databases with deprecated Ordinary engine
   */
  allow_deprecated_database_ordinary?: boolean;

  /**
   * Allow usage of deprecated error prone window functions (neighbor, runningAccumulate, runningDifferenceStartingWithFirstValue, runningDifference)
   */
  allow_deprecated_error_prone_window_functions?: boolean;

  /**
   * Allow to create *MergeTree tables with deprecated engine definition syntax
   */
  allow_deprecated_syntax_for_merge_tree?: boolean;

  /**
   * Enable independent `DISTINCT` evaluation per partition on separate threads when the partition expression is a deterministic function of the `DISTINCT` columns, skipping the cross-stream merge. Beneficial when the number of partitions is close to the number of cores and partitions have roughly the same size; otherwise a cost heuristic skips it, see [max_number_of_partitions_for_independent_distinct](#max_number_of_partitions_for_independent_distinct) and [force_distinct_partitions_independently](#force_distinct_partitions_independently). Not applied with `FINAL` or parallel replicas. Not applied when [max_rows_in_distinct](#max_rows_in_distinct) or [max_bytes_in_distinct](#max_bytes_in_distinct) is set: those limits are enforced by the single `DISTINCT` transform that sees the whole merged result, so the cross-stream merge is kept to preserve their global meaning.
   * @since 26.9
   */
  allow_distinct_partitions_independently?: boolean;

  /**
   * If it is set to true, then a user is allowed to executed distributed DDL queries.
   */
  allow_distributed_ddl?: boolean;

  /**
   * Allow ALTER TABLE ... DROP DETACHED PART[ITION] ... queries
   */
  allow_drop_detached?: boolean;

  /**
   * Allows using Dynamic type in JOIN keys. Added for compatibility. It's not recommended to use Dynamic type in JOIN keys because comparison with other types may lead to unexpected results.
   * @since 25.11
   */
  allow_dynamic_type_in_join_keys?: boolean;

  /**
   * Allow reading through the `executable` table function and from `Executable` and `ExecutablePool` tables. Disabling this refuses reads only: creating, attaching, dropping and describing such tables still works. `ExecutablePool` processes that have already started are left running rather than terminated, but each read is still refused until the setting is enabled again.
   * @since 26.11
   */
  allow_executable_tables?: boolean;

  /**
   * Allow execute multiIf function columnar
   */
  allow_execute_multiif_columnar?: boolean;

  /**
   * Obsolete since v26.9: the analyzer cannot be disabled anymore. The analyzer is the query analysis and planning infrastructure that has been the default since v24.3. In v26.9 this setting was frozen at its only supported value, `1`, and the `compatibility` setting no longer reverts it. In v26.10 the query analysis it used to switch to was removed. For backward compatibility, setting it to `0` is accepted and replaced with `1`, so queries, session settings, settings profiles and client configurations that still set `enable_analyzer = 0` keep working, with the analyzer. To compare the behaviour or the performance of a query with the old query analysis, use a ClickHouse version older than v26.9.
   */
  allow_experimental_analyzer?: boolean;

  /**
   * Allow to clean up old data files during Iceberg compaction. The cleanup runs `iceberg_compaction_data_cleanup` after a compaction. It expires the snapshots the compaction made obsolete, the same way as `expire_snapshots`: removes them from the table metadata and deletes the files that no other snapshot references. For a table of the format version 1 or behind a transactional catalog it only deletes the files, and the snapshots stay in the metadata.
   * @since 26.6
   */
  allow_experimental_cleanup_old_data_files_compaction?: boolean;

  /**
   * Allow experimental database engine DataLakeCatalog with catalog_type = 'hms'
   * @since 25.6
   */
  allow_experimental_database_hms_catalog?: boolean;

  /**
   * Allow to create database with Engine=MaterializedPostgreSQL(...).
   */
  allow_experimental_database_materialized_postgresql?: boolean;

  /**
   * Allow experimental database engine DataLakeCatalog with catalog_type = 'paimon_rest'
   * @since 26.2
   */
  allow_experimental_database_paimon_rest_catalog?: boolean;

  /**
   * Enable experimental table function `eval`.
   * @since 26.8
   */
  allow_experimental_eval_table_function?: boolean;

  /**
   * Allow to execute experimental Iceberg command `ALTER TABLE ... EXECUTE expire_snapshots`.
   * @since 26.4
   */
  allow_experimental_expire_snapshots?: boolean;

  /**
   * Enable experimental hash functions
   */
  allow_experimental_hash_functions?: boolean;

  /**
   * Allow to explicitly use 'OPTIMIZE' for iceberg tables.
   * @since 25.9
   */
  allow_experimental_iceberg_compaction?: boolean;

  /**
   * Enable the Kusto Query Language (KQL) dialect - an alternative to SQL.
   * @since 25.2
   */
  allow_experimental_kusto_dialect?: boolean;

  /**
   * Allow LATERAL JOIN syntax. When enabled, subqueries in the right side of a JOIN can reference columns from the left side, enabling correlated subqueries in the FROM clause (SQL standard LATERAL JOIN).
   * @since 26.11
   */
  allow_experimental_lateral_join?: boolean;

  /**
   * Enable experimental functions for natural language processing.
   */
  allow_experimental_nlp_functions?: boolean;

  /**
   * Allow to use hive partitioning with S3Queue/AzureQueue engines
   * @since 26.2
   */
  allow_experimental_object_storage_queue_hive_partitioning?: boolean;

  /**
   * Allow to create tables with Paimon* table engines.
   * @since 26.6
   */
  allow_experimental_paimon_storage_engine?: boolean;

  /**
   * Use up to `max_parallel_replicas` the number of replicas from each shard for SELECT query execution. Reading is parallelized and coordinated dynamically. 0 - disabled, 1 - enabled, silently disable them in case of failure, 2 - enabled, throw an exception in case of failure
   */
  allow_experimental_parallel_reading_from_replicas?: bigint;

  /**
   * Enable polyglot SQL transpiler - transpiles SQL from 30+ dialects (MySQL, PostgreSQL, SQLite, Snowflake, DuckDB, etc.) into ClickHouse SQL.
   * @since 26.4
   */
  allow_experimental_polyglot_dialect?: boolean;

  /**
   * Enable PRQL - an alternative to SQL.
   * @since 25.2
   */
  allow_experimental_prql_dialect?: boolean;

  /**
   * Experimental dictionary source for integration with YTsaurus.
   * @since 25.9
   */
  allow_experimental_ytsaurus_dictionary_source?: boolean;

  /**
   * Experimental table engine for integration with YTsaurus.
   * @since 25.9
   */
  allow_experimental_ytsaurus_table_engine?: boolean;

  /**
   * Experimental table engine for integration with YTsaurus.
   * @since 25.9
   */
  allow_experimental_ytsaurus_table_function?: boolean;

  /**
   * Enables the `fuzzQuery` function that applies random AST mutations to a query string.
   * @since 26.3
   */
  allow_fuzz_query_functions?: boolean;

  /**
   * Allows a more general join planning algorithm that can handle more complex conditions, but only works with hash join. If hash join is not enabled, then the usual join planning algorithm is used regardless of the value of this setting.
   * @since 25.2
   */
  allow_general_join_planning?: boolean;

  /**
   * Allow parsing Iceberg `geometry` and `geography` field types as ClickHouse `Geometry` (Variant) type.
   * @since 26.10
   */
  allow_geo_types_in_iceberg?: boolean;

  /**
   * Allow to use the function `getClientHTTPHeader` which lets to obtain a value of the current HTTP request's header. It is not enabled by default for security reasons, because some headers, such as `Cookie`, could contain sensitive info. Note that the `X-ClickHouse-*`, `Authentication` and `Authorization` headers are always restricted and cannot be obtained with this function.
   */
  allow_get_client_http_header?: boolean;

  /**
   * Allow functions that use Hyperscan library. Disable to avoid potentially long compilation times and excessive resource usage.
   */
  allow_hyperscan?: boolean;

  /**
   * Allow to use 'ALTER TABLE ... EXECUTE remove_orphan_files()' for iceberg tables.
   * @since 26.5
   */
  allow_iceberg_remove_orphan_files?: boolean;

  /**
   * Allow to execute `insert` queries into iceberg.
   * @since 26.3
   */
  allow_insert_into_iceberg?: boolean;

  /**
   * Enables or disables [introspection functions](/reference/functions/regular-functions/introspection) for query profiling. Possible values: - 1 — Introspection functions enabled. - 0 — Introspection functions disabled. **See Also** - [Sampling Query Profiler](/concepts/features/performance/troubleshoot/sampling-query-profiler) - System table [trace_log](/reference/system-tables/trace_log)
   */
  allow_introspection_functions?: boolean;

  /**
   * If it is set to true, and the conditions of `join_to_sort_minimum_perkey_rows` and `join_to_sort_maximum_table_rows` are met, rerange the right table by key to improve the performance in left or inner hash join. This setting is experimental and currently does not work together with all other join optimizations. In particular, when the right table is reranged, the per-key split controlled by `joined_block_split_single_row` is disabled, so neither `max_joined_block_size_rows` nor `max_joined_block_size_bytes` bounds the number of rows produced for a single left row.
   * @since 26.10
   */
  allow_join_right_table_sorting?: boolean;

  /**
   * Allow storing Kafka related offsets in ClickHouse Keeper. When enabled, a ClickHouse Keeper path and replica name can be specified to the Kafka table engine. As a result instead of the regular Kafka engine, a new type of storage engine will be used that stores the committed offsets primarily in ClickHouse Keeper
   * @since 26.10
   */
  allow_kafka_offsets_storage_in_keeper?: boolean;

  /**
   * Rewrite predicates of the form `coalesce(a_1, ..., a_N) <op> const` (and equivalently `ifNull`, or with the constant on the left) into the disjunction `(a_1 <op> const) OR (a_1 IS NULL AND a_2 <op> const) OR ... OR (a_1 IS NULL AND ... AND a_{N-1} IS NULL AND a_N <op> const)` before index analysis, so per-column primary key and skip indexes on each `a_i` can be used. Partial-constant forms such as `coalesce(a, 42, b)` and `coalesce(a, b, 42)` are handled: the argument list is normalized like `coalesce` itself (`NULL` literals dropped, arguments after the first non-`Nullable` one dropped), and a trailing non-`NULL` constant, if any, is emitted as the final branch. The rewrite is strictly additive for index pruning; runtime filtering still uses the original predicate. Additionally, exact equality predicates of the form `nullIf(key, sentinel) = const` (where `sentinel != const` and types match exactly) are rewritten to `key = const` so primary key, partition, and skip indexes on `key` can prune granules directly. Range and disjunctive nullIf pruning is not supported.
   * @since 26.6
   */
  allow_key_condition_coalesce_rewrite?: boolean;

  /**
   * Enable independent `LIMIT BY` evaluation per partition on separate threads when the partition expression is a deterministic function of the `LIMIT BY` columns.
   * @since 26.7
   */
  allow_limit_by_partitions_independently?: boolean;

  /**
   * When enabled, `if`/`multiIf`/`coalesce`/`ifNull`/`array`/`map` over a set of numeric arguments that has no lossless common type (for example a `Decimal` and a `Float64`, or an `Int64` and a `Float64`) resolve to a numeric supertype (`Float64`) instead of failing, with possible precision loss. This allows the result to be used directly with value-combining aggregate functions like `sum`, `avg`, `min` and `max`. This is independent of `use_variant_as_common_type`: the numeric supertype is produced whether or not `use_variant_as_common_type` is enabled. When disabled (the default), such argument sets have no common type, so they either become a `Variant` (if `use_variant_as_common_type` is enabled) or raise `NO_COMMON_TYPE`.
   * @since 26.9
   */
  allow_lossy_numeric_supertype?: boolean;

  /**
   * Allow CREATE MATERIALIZED VIEW with SELECT query that references nonexistent tables or columns. It must still be syntactically valid. Doesn't apply to refreshable MVs. Doesn't apply if the MV schema needs to be inferred from the SELECT query (i.e. if the CREATE has no column list and no TO table). Can be used for creating MV before its source table.
   */
  allow_materialized_view_with_bad_select?: boolean;

  /**
   * If true, ALTER MODIFY COLUMN on a named Tuple that only adds new subfields is metadata-only (no data mutation). Set to false to force the old full-mutation behavior.
   * @since 26.9
   */
  allow_metadata_only_named_tuple_alter?: boolean;

  /**
   * Allow creating minmax skip indexes on JSON (Object) columns. Disabled by default because the minmax index serialization path cannot handle heterogeneous Field values that JSON columns may contain.
   * @since 26.8
   */
  allow_minmax_index_for_json?: boolean;

  /**
   * Allows `ALTER` statements that modify data on disk, not only table metadata. When disabled, an `ALTER` DDL statement on a `MergeTree`-family table is rejected with `ALTER_OF_COLUMN_IS_FORBIDDEN` if it would rewrite data on disk, either directly or by scheduling a mutation (see `system.mutations`). This covers: - `ALTER TABLE ... MODIFY COLUMN` with a type change that rewrites the column, `ALTER TABLE ... DROP COLUMN` or `... CLEAR COLUMN` of a physical column, `ALTER TABLE ... RENAME COLUMN` of any column including an `ALIAS`, `ALTER TABLE ... DROP INDEX`, `... CLEAR INDEX`, `... DROP PROJECTION`, `... CLEAR PROJECTION`, `... DROP STATISTICS`, `... CLEAR STATISTICS`, and `ALTER TABLE ... MODIFY TTL` when `materialize_ttl_after_modify` is enabled. - `ALTER TABLE ... UPDATE` whenever it runs as a heavyweight mutation, which is the default `alter_update_mode = 'heavy'` and every case the other modes fall back to, `ALTER TABLE ... DELETE WHERE`, `ALTER TABLE ... MATERIALIZE INDEX`, `... MATERIALIZE PROJECTION`, `... MATERIALIZE STATISTICS`, `... MATERIALIZE COLUMN`, `... MATERIALIZE TTL` (unconditionally, unlike `MODIFY TTL` above), `... APPLY DELETED MASK`, `... APPLY PATCHES` and `... REWRITE PARTS`. Other `ALTER` statements are allowed, including `ADD COLUMN`, `COMMENT COLUMN`, `MODIFY SETTING`, an `Enum` extension, and `DROP COLUMN` of an `ALIAS` column. The dedicated `DELETE FROM ...` and `UPDATE ... SET ...` statements are a different thing from the `ALTER TABLE ... DELETE WHERE` and `ALTER TABLE ... UPDATE` commands above, and this setting never refuses them, in any mode they support. It governs `ALTER` DDL only. Use `GRANT` and `REVOKE` of `ALTER DELETE` and `ALTER UPDATE` to restrict data modification as a whole; note that those privileges cover the dedicated statements and the `ALTER` commands together, so they cannot separate the two forms. The check applies only to `MergeTree`-family tables. Other engines, such as `Memory`, `Log`, `StripeLog`, `KeeperMap` and `EmbeddedRocksDB`, ignore this setting.
   */
  allow_non_metadata_alters?: boolean;

  /**
   * Allow non-const timezone arguments in certain time-related functions like toTimeZone(), fromUnixTimestamp*(), snowflakeIDToDateTime*(). This setting exists only for compatibility reasons. In ClickHouse, the time zone is a property of the data type, respectively of the column. Enabling this setting gives the wrong impression that different values within a column can have different timezones. Therefore, please do not enable this setting.
   */
  allow_nonconst_timezone_arguments?: boolean;

  /**
   * User-level setting that allows mutations on replicated tables to make use of non-deterministic functions such as `dictGet`. Given that, for example, dictionaries, can be out of sync across nodes, mutations that pull values from them are disallowed on replicated tables by default. Enabling this setting allows this behavior, making it the user's responsibility to ensure that the data used is in sync across all nodes. **Example** ```xml <profiles> <default> <allow_nondeterministic_mutations>1</allow_nondeterministic_mutations> <!-- ... --> </default> <!-- ... --> </profiles> ```
   */
  allow_nondeterministic_mutations?: boolean;

  /**
   * Allow nondeterministic (like `rand` or `dictGet`, since later has some caveats with updates) functions in sharding key. Possible values: - 0 — Disallowed. - 1 — Allowed.
   */
  allow_nondeterministic_optimize_skip_unused_shards?: boolean;

  /**
   * Controls whether extracted subcolumns of type `Tuple(...)` can be typed as `Nullable(Tuple(...))`. - `false`: Return `Tuple(...)` and use default tuple values for rows where the subcolumn is missing. - `true`: Return `Nullable(Tuple(...))` and use `NULL` for rows where the subcolumn is missing. This setting controls extracted subcolumn behavior only. It does not control whether `Nullable(Tuple(...))` columns can be created in tables; that is controlled by `enable_nullable_tuple_type`. ClickHouse uses the value for this setting loaded at server startup. Changes made with `SET` or query-level `SETTINGS` do not change extracted subcolumn behavior. To change extracted subcolumn behavior, update `allow_nullable_tuple_in_extracted_subcolumns` in startup profile configuration (for example, users.xml) and restart the server.
   * @since 26.4
   */
  allow_nullable_tuple_in_extracted_subcolumns?: boolean;

  /**
   * Prefer prefetched threadpool if all parts are on local filesystem
   */
  allow_prefetched_read_pool_for_local_filesystem?: boolean;

  /**
   * Prefer prefetched threadpool if all parts are on remote filesystem
   */
  allow_prefetched_read_pool_for_remote_filesystem?: boolean;

  /**
   * Let the preliminary (per-stream) `DISTINCT` give up deduplicating mostly-unique input, freeing its hash table and passing the remaining rows through. The preliminary `DISTINCT` is best-effort by design - duplicates from different streams pass through it even when it deduplicates - and the final `DISTINCT` deduplicates its output again, so abandoning gives up the removal of almost nothing and saves the memory and hashing of a second copy of the unique keys. Not applied when the preliminary `DISTINCT` carries a limit hint (a plain `LIMIT` with no subsequent ordering).
   * @since 26.10
   */
  allow_preliminary_distinct_abandoning?: boolean;

  /**
   * Allows push predicate on AST level for distributed subqueries with enabled anlyzer
   * @since 25.2
   */
  allow_push_predicate_ast_for_distributed_subqueries?: boolean;

  /**
   * Allows push predicate when subquery contains WITH clause
   */
  allow_push_predicate_when_subquery_contains_with?: boolean;

  /**
   * Allow passing arguments to the `RANK` and `DENSE_RANK` window functions for backward compatibility. Per SQL standard, `RANK` and `DENSE_RANK` take zero arguments — they rank rows based on the `OVER (ORDER BY ...)` window only. In ClickHouse versions before 26.5, queries such as `RANK(x) OVER (...)` silently accepted and ignored the argument, which led to user confusion (the visible argument suggested it influenced the ranking, but it did not). When this setting is `false` (the default), `RANK` and `DENSE_RANK` reject any arguments and throw `NUMBER_OF_ARGUMENTS_DOESNT_MATCH`. When set to `true`, the legacy lenient behavior is restored — arguments are silently ignored, matching the pre-26.5 behavior.
   * @since 26.6
   */
  allow_rank_dense_rank_arguments?: boolean;

  /**
   * When moving conditions from WHERE to PREWHERE, allow reordering them to optimize filtering
   */
  allow_reorder_prewhere_conditions?: boolean;

  /**
   * Allow `ALTER TABLE ... REPLACE PARTITION ... FROM ...` to silently drop the destination partition when the source has no parts in that partition. By default this is disallowed: `REPLACE PARTITION` from a source that has no data in the requested partition raises an exception, because in this case the operation effectively becomes a silent `DROP PARTITION` on the destination (the destination's data is removed and nothing replaces it), a common cause of accidental data loss (see [#23727](https://github.com/ClickHouse/ClickHouse/issues/23727)). Enable this setting to restore the previous behavior, for example when you intentionally use an empty source partition to clear data in the destination. For an unconditional drop, prefer `ALTER TABLE ... DROP PARTITION ...` instead.
   * @since 26.7
   */
  allow_replace_partition_from_empty_source?: boolean;

  /**
   * Control whether `SETTINGS` after `FORMAT` in `INSERT` queries is allowed or not. It is not recommended to use this, since this may interpret part of `SETTINGS` as values. Example: ```sql INSERT INTO FUNCTION null('foo String') SETTINGS max_threads=1 VALUES ('bar'); ``` But the following query will work only with `allow_settings_after_format_in_insert`: ```sql SET allow_settings_after_format_in_insert=1; INSERT INTO FUNCTION null('foo String') VALUES ('bar') SETTINGS max_threads=1; ``` Possible values: - 0 — Disallow. - 1 — Allow. <Note> Use this setting only for backward compatibility if your use cases depend on old syntax. </Note>
   */
  allow_settings_after_format_in_insert?: boolean;

  /**
   * Allow using simdjson library in 'JSON*' functions if AVX2 instructions are available. If disabled rapidjson will be used.
   */
  allow_simdjson?: boolean;

  /**
   * Allows to output columns with special serialization kinds like Sparse and Replicated without converting them to full column representation. It helps to avoid unnecessary data copy during formatting.
   * @since 25.12
   */
  allow_special_serialization_kinds_in_output_formats?: boolean;

  /**
   * Allows defining columns with [statistics](/reference/engines/table-engines/mergetree-family/mergetree#table_engine-mergetree-creating-a-table) and [manipulate statistics](/reference/engines/table-engines/mergetree-family/mergetree#column-statistics).
   * @since 26.4
   */
  allow_statistics?: boolean;

  /**
   * Allows using statistics to optimize queries
   */
  allow_statistics_optimize?: boolean;

  /**
   * If it is set to true, allow to specify meaningless compression codecs.
   */
  allow_suspicious_codecs?: boolean;

  /**
   * In CREATE TABLE statement allows creating columns of type FixedString(n) with n > 256. FixedString with length >= 256 is suspicious and most likely indicates a misuse
   */
  allow_suspicious_fixed_string_types?: boolean;

  /**
   * Reject primary/secondary indexes and sorting keys with identical expressions
   * @since 26.11
   */
  allow_suspicious_indexes?: boolean;

  /**
   * Allows or restricts using [LowCardinality](/reference/data-types/lowcardinality) with data types with fixed size of 8 bytes or less: numeric data types and `FixedString(8_bytes_or_less)`. For small fixed values using of `LowCardinality` is usually inefficient, because ClickHouse stores a numeric index for each row. As a result: - Disk space usage can rise. - RAM consumption can be higher, depending on a dictionary size. - Some functions can work slower due to extra coding/encoding operations. Merge times in [MergeTree](/reference/engines/table-engines/mergetree-family/mergetree)-engine tables can grow due to all the reasons described above. Possible values: - 1 — Usage of `LowCardinality` is not restricted. - 0 — Usage of `LowCardinality` is restricted.
   */
  allow_suspicious_low_cardinality_types?: boolean;

  /**
   * Allow suspicious `PRIMARY KEY`/`ORDER BY` for MergeTree (i.e. SimpleAggregateFunction).
   */
  allow_suspicious_primary_key?: boolean;

  /**
   * Reject TTL expressions that don't depend on any of table's columns. It indicates a user error most of the time.
   */
  allow_suspicious_ttl_expressions?: boolean;

  /**
   * Allows or restricts using [Variant](/reference/data-types/variant) and [Dynamic](/reference/data-types/dynamic) types in GROUP BY keys.
   * @since 24.12
   */
  allow_suspicious_types_in_group_by?: boolean;

  /**
   * Allows or restricts using [Variant](/reference/data-types/variant) and [Dynamic](/reference/data-types/dynamic) types in ORDER BY keys.
   * @since 24.12
   */
  allow_suspicious_types_in_order_by?: boolean;

  /**
   * In CREATE TABLE statement allows specifying Variant type with similar variant types (for example, with different numeric or date types). Enabling this setting may introduce some ambiguity when working with values with similar types.
   */
  allow_suspicious_variant_types?: boolean;

  /**
   * Allow unrestricted (without condition on path) reads from system.zookeeper table, can be handy, but is not safe for zookeeper
   */
  allow_unrestricted_reads_from_keeper?: boolean;

  /**
   * Allow wildcard expansion for `url()` and `ENGINE = URL` from HTTP index pages.
   * @since 26.10
   */
  allow_url_wildcard_from_index_pages?: boolean;

  /**
   * Enable independent evaluation of window functions per partition on separate threads when the partition expression of the `MergeTree` table is a deterministic function of the window `PARTITION BY` columns. Each partition is read through a separate stream, sorted independently by the window sort description, and processed by its own window transform, skipping the hash scatter that ordinarily reshuffles every row across threads. Beneficial when the number of partitions is close to the number of cores and partitions have roughly the same size; otherwise a cost heuristic skips it, see [max_number_of_partitions_for_independent_window](#max_number_of_partitions_for_independent_window) and [force_window_partitions_independently](#force_window_partitions_independently). Not applied with `FINAL` or parallel replicas.
   * @since 26.9
   */
  allow_window_partitions_independently?: boolean;

  /**
   * Execute ALTER TABLE MOVE ... TO [DISK|VOLUME] asynchronously
   */
  alter_move_to_space_execute_async?: boolean;

  /**
   * Enables or disables the display of information about the parts to which the manipulation operations with partitions and parts have been successfully applied. Applicable to [ATTACH PARTITION|PART](/reference/statements/alter/partition#attach-partitionpart) and to [FREEZE PARTITION](/reference/statements/alter/partition#freeze-partition). Possible values: - 0 — disable verbosity. - 1 — enable verbosity. **Example** ```sql CREATE TABLE test(a Int64, d Date, s String) ENGINE = MergeTree PARTITION BY toYYYYMDECLARE(d) ORDER BY a; INSERT INTO test VALUES(1, '2021-01-01', ''); INSERT INTO test VALUES(1, '2021-01-01', ''); ALTER TABLE test DETACH PARTITION ID '202101'; ALTER TABLE test ATTACH PARTITION ID '202101' SETTINGS alter_partition_verbose_result = 1; ┌─command_type─────┬─partition_id─┬─part_name────┬─old_part_name─┐ │ ATTACH PARTITION │ 202101 │ 202101_7_7_0 │ 202101_5_5_0 │ │ ATTACH PARTITION │ 202101 │ 202101_8_8_0 │ 202101_6_6_0 │ └──────────────────┴──────────────┴──────────────┴───────────────┘ ALTER TABLE test FREEZE SETTINGS alter_partition_verbose_result = 1; ┌─command_type─┬─partition_id─┬─part_name────┬─backup_name─┬─backup_path───────────────────┬─part_backup_path────────────────────────────────────────────┐ │ FREEZE ALL │ 202101 │ 202101_7_7_0 │ 8 │ /var/lib/clickhouse/shadow/8/ │ /var/lib/clickhouse/shadow/8/data/default/test/202101_7_7_0 │ │ FREEZE ALL │ 202101 │ 202101_8_8_0 │ 8 │ /var/lib/clickhouse/shadow/8/ │ /var/lib/clickhouse/shadow/8/data/default/test/202101_8_8_0 │ └──────────────┴──────────────┴──────────────┴─────────────┴───────────────────────────────┴─────────────────────────────────────────────────────────────┘ ```
   */
  alter_partition_verbose_result?: boolean;

  /**
   * Allows you to specify how [`ALTER`](/reference/statements/alter/index), [`OPTIMIZE`](/reference/statements/optimize), or [`TRUNCATE`](/reference/statements/truncate) queries wait for their operations to complete. Possible values: - `0` — Do not wait. - `1` — Wait for own execution. - `2` — Wait for everyone. - `3` - Only wait for active replicas. Inactive replicas apply the change when they become active. Cloud default value: `0`. <Note> `alter_sync` applies to `ALTER` queries on `MergeTree`-family tables. Values `2` and `3` wait for replicas only on `ReplicatedMergeTree` and `SharedMergeTree` tables. </Note>
   */
  alter_sync?: bigint;

  /**
   * A mode for `ALTER` queries that have the `UPDATE` commands. Possible values: - `heavy` - run regular mutation. - `lightweight` - run lightweight update if possible, run regular mutation otherwise. - `lightweight_force` - run lightweight update if possible, throw otherwise.
   * @since 25.6
   */
  alter_update_mode?: "heavy" | "lightweight" | "lightweight_force";

  /**
   * Allow one atomic condition of the `WHERE`/`PREWHERE` expression (a single comparison, `IN`, `has`, etc.) to constrain multiple key columns during index analysis. For example, if a table has `ORDER BY (toDate(ts), ts)` and the query has `WHERE ts = '2026-01-10 00:00:00' AND user_id = 42`, the first of the two conditions constrains both key columns: it is analyzed as if `toDate(ts) = '2026-01-10' AND ts = '2026-01-10 00:00:00'` were written. When the setting is disabled, this predicate constrains only `ts`. Tuple membership predicates such as `(a, b) IN ((1, 2), (3, 4))` can still constrain multiple key columns.
   * @since 26.11
   */
  analyze_index_with_multiple_key_columns_per_condition?: boolean;

  /**
   * If a table has a space-filling curve in its index, e.g. `ORDER BY mortonEncode(x, y)` or `ORDER BY hilbertEncode(x, y)`, and the query has conditions on its arguments, e.g. `x >= 10 AND x <= 20 AND y >= 20 AND y <= 30`, use the space-filling curve for index analysis. Currently, 2D analysis skips curves with `UInt64` arguments because the curve implementations use only 32 bits per argument.
   */
  analyze_index_with_space_filling_curves?: boolean;

  /**
   * Allow to add compound identifiers to nested. This is a compatibility setting because it changes the query result. When disabled, `SELECT a.b.c FROM table ARRAY JOIN a` does not work, and `SELECT a FROM table` does not include `a.b.c` column into `Nested a` result.
   * @since 25.9
   */
  analyzer_compatibility_allow_compound_identifiers_in_unflatten_nested?: boolean;

  /**
   * Allow a Common Table Expression name to be defined more than once in a single `WITH` clause. A reference to such a name binds to the latest definition that is not being resolved at that moment: a redefinition can read the previous definition of the same name, and the query body reads the last one. This matches the query analysis that ClickHouse used before v24.3, where a later definition silently shadowed the earlier ones. One shape differs from that analysis: a CTE declared between two definitions of a name also binds to the last definition, where the old analysis bound it to the definition visible at its declaration point. By default a redefinition is rejected with `MULTIPLE_EXPRESSIONS_FOR_ALIAS`. A CTE declared as `MATERIALIZED` and a CTE in a `WITH RECURSIVE` clause cannot be redefined even when the setting is enabled. Possible values: - 0 - A CTE name can be defined only once in a `WITH` clause. - 1 - A later definition of a CTE name shadows the earlier ones.
   * @since 26.11
   */
  analyzer_compatibility_allow_cte_redefinition?: boolean;

  /**
   * When enabled, the analyzer mimics the legacy behavior of moving non-aggregate AND-conjuncts from `HAVING` to `WHERE` instead of raising `NOT_AN_AGGREGATE`. The standard-compliant rejection is the default; this is a migration aid for queries that were silently accepted by the query analysis that ClickHouse used before v24.3. Conjuncts containing aggregate, `grouping`, or non-deterministic functions stay in `HAVING`. If any conjunct contains a window function or a stateful function (for example `rowNumberInBlock`), the rewrite is disabled for the whole `HAVING`, matching the behaviour of that older analysis. The setting is also ignored when `GROUP BY` uses `WITH CUBE`, `WITH ROLLUP`, `WITH TOTALS`, or `GROUPING SETS`.
   * @since 26.8
   */
  analyzer_compatibility_allow_non_aggregate_in_having?: boolean;

  /**
   * Restores the behavior of versions before 26.6, where the `FINAL` modifier specified on the left-most table of a JOIN was incorrectly applied to all other joined tables as well (for engines that support `FINAL`, e.g. `ReplacingMergeTree`). By default `FINAL` applies only to the table it is written on. Enable for compatibility with queries that rely on the old behavior; the recommended fix is to write `FINAL` explicitly on every table that needs it. Possible values: - 0 - `FINAL` applies only to the table it is specified on. - 1 - `FINAL` on the left-most table of a JOIN is applied to all joined tables.
   * @since 26.9
   */
  analyzer_compatibility_apply_final_to_all_joined_tables?: boolean;

  /**
   * Force to resolve identifier in JOIN USING from projection (for example, in `SELECT a + 1 AS b FROM t1 JOIN t2 USING (b)` join will be performed by `t1.a + 1 = t2.b`, rather then `t1.b = t2.b`). Aliases defined elsewhere in the query are also considered: in the `WITH` clause, on subexpressions inside the SELECT list, or in other clauses (for example, in `WITH a + 1 AS b SELECT count() FROM t1 JOIN t2 USING (b)` and in `SELECT uniqExact(a + 1 AS b) FROM t1 JOIN t2 USING (b)` the join is performed by `t1.a + 1 = t2.b`). In a query with several `JOIN`s only the outermost `JOIN` resolves its `USING` identifier from an alias; an inner `JOIN` resolves it from its left table, as the old analyzer did. When the matching alias is not a top-level alias of the SELECT list, parallel replicas are disabled for the query. For queries sent to remote servers (`Distributed` tables, the `remote` table function), such a query is rejected with an exception only when the identifier cannot be resolved on the remote server at all; if the alias shadows a real column of the left table, the remote server joins by that column instead, so the results may differ from local execution.
   */
  analyzer_compatibility_join_using_top_level_identifier?: boolean;

  /**
   * When enabled and the `FROM` clause of a query contains two or more `JOIN`s (comma-separated tables count; `ARRAY JOIN` does not), the analyzer names result columns the way the old analyzer's multiple-joins rewrite did: - columns produced by expanding `*`, `<table>.*` or `COLUMNS('<regexp>')` get names of the form `<alias-or-table>.<column>` (the qualifier is the table expression's alias if it has one, otherwise the table name without the database, otherwise the CTE name; columns of a joined subquery without an alias are left unqualified). Two kinds of column keep their bare name because they belong to the join rather than to a single table expression: a column produced by `ARRAY JOIN`, and a key merged by `JOIN ... USING`. Outer references such as `SELECT ll.arr` or `SELECT ll.k` therefore do not resolve in those two shapes; - the identifier-list form `COLUMNS(col1, col2)` is not a matcher expansion: each column keeps the name exactly as its identifier was written, so `COLUMNS(x)` produces `x` and `COLUMNS(a.x)` produces `a.x`; - an unaliased column reference in the `SELECT` list keeps its name exactly as written (e.g. `SELECT a.x` produces a column named `a.x` even when `x` is unambiguous). This makes outer queries that reference such columns by their qualified names work, for example: ```sql SELECT ll.Date FROM (SELECT * FROM t AS ll LEFT JOIN t1 ON ll.k = t1.k LEFT JOIN t2 ON ll.k = t2.k); ```
   * @since 26.9
   */
  analyzer_compatibility_multiple_joins_qualify_column_names?: boolean;

  /**
   * When a multi-part identifier like `b.id` could refer to either the column `id` of a table aliased `b` or to a Tuple subcolumn `b.id` of some other column, prefer the alias-prefix interpretation (column `id` of `b`). By default the analyzer prefers the subcolumn. Enable to match the old analyzer's resolution.
   * @since 26.7
   */
  analyzer_compatibility_prefer_alias_over_subcolumn?: boolean;

  /**
   * When enabled, the analyzer substitutes ordinary (non-materialized, non-parameterized) views with their defining subqueries, enabling cross-boundary optimizations such as predicate pushdown and column pruning.
   * @since 26.5
   */
  analyzer_inline_views?: boolean;

  /**
   * When enabled (the default), `ANTI` JOIN keeps columns from both sides accessible in the joined result, and `SELECT *` returns columns from both sides. This is the legacy ClickHouse behavior. When disabled, the analyzer restricts `ANTI` JOIN column access to the preserved side in accordance with the SQL standard. For `LEFT ANTI JOIN` only left table columns are accessible, for `RIGHT ANTI JOIN` only right table columns. This applies to expressions resolved from the joined result, such as `SELECT`, `PREWHERE`, `WHERE`, `GROUP BY`, `HAVING`, `QUALIFY`, `ORDER BY`, and `LIMIT BY` clauses, including qualified wildcards like `t1.*`. An explicit reference to a non-preserved side column raises the `SEMI_ANTI_JOIN_COLUMN_ACCESS_DENIED` exception. This covers qualified references such as `t2.b`, qualified wildcards like `t2.*`, `USING` columns like `d.id`, and fully qualified references like `db.table.column`, and it is enforced even inside statically-dead branches such as `if(false, t2.b, 42)`. An unqualified identifier that does not match any accessible column still falls back to the generic `UNKNOWN_IDENTIFIER` exception. The `JOIN ON` expression of the same `JOIN` can access both sides regardless of this setting.
   * @since 26.11
   */
  anti_join_include_columns_from_both_sides?: boolean;

  /**
   * Enables legacy ClickHouse server behaviour in `ANY INNER|LEFT JOIN` operations. <Note> Use this setting only for backward compatibility if your use cases depend on legacy `JOIN` behaviour. </Note> When the legacy behaviour is enabled: - Results of `t1 ANY LEFT JOIN t2` and `t2 ANY RIGHT JOIN t1` operations are not equal because ClickHouse uses the logic with many-to-one left-to-right table keys mapping. - Results of `ANY INNER JOIN` operations contain all rows from the left table like the `SEMI LEFT JOIN` operations do. When the legacy behaviour is disabled: - Results of `t1 ANY LEFT JOIN t2` and `t2 ANY RIGHT JOIN t1` operations are equal because ClickHouse uses the logic which provides one-to-many keys mapping in `ANY RIGHT JOIN` operations. - Results of `ANY INNER JOIN` operations contain one row per key from both the left and right tables. Possible values: - 0 — Legacy behaviour is disabled. - 1 — Legacy behaviour is enabled. See also: - [JOIN strictness](/reference/statements/select/join#settings)
   */
  any_join_distinct_right_table_keys?: boolean;

  /**
   * Enables filtering out rows deleted with lightweight DELETE. If disabled, a query will be able to read those rows. This is useful for debugging and "undelete" scenarios
   */
  apply_deleted_mask?: boolean;

  /**
   * If true, mutations (UPDATEs and DELETEs) which are not materialized in data part will be applied on SELECTs.
   */
  apply_mutations_on_fly?: boolean;

  /**
   * If true, patch parts (that represent lightweight updates) are applied on SELECTs.
   * @since 25.6
   */
  apply_patch_parts?: boolean;

  /**
   * The number of buckets in the temporary cache for applying patch parts in Join mode.
   * @since 25.9
   */
  apply_patch_parts_join_cache_buckets?: bigint;

  /**
   * When enabled, PREWHERE conditions are applied after FINAL processing for ReplacingMergeTree and similar engines. This can be useful when PREWHERE references columns that may have different values across duplicate rows, and you want FINAL to select the winning row before filtering. When disabled, PREWHERE is applied during reading. Note: PREWHERE is also deferred, regardless of this setting, whenever a row policy is deferred by `apply_row_policy_after_final`, because the row policy must be applied before PREWHERE. That happens when the policy expression is non-deterministic, or reads a column that is not in ORDER BY, or reads an ORDER BY column whose type is or contains a floating-point type. Possible values: - 0 — PREWHERE is applied before FINAL, unless a deferred row policy defers it too (default). - 1 — PREWHERE is applied after FINAL.
   * @since 26.1
   */
  apply_prewhere_after_final?: boolean;

  /**
   * When enabled, row policies are applied after FINAL processing for *MergeTree tables. (Especially for ReplacingMergeTree) When the policy is deferred this way, PREWHERE is deferred with it so that the policy is still applied first (see `apply_prewhere_after_final` for deferring PREWHERE unconditionally). When disabled, row policies are applied before FINAL, which can cause different results when the policy filters out rows that should be used for deduplication in ReplacingMergeTree or similar engines. If the row policy expression is deterministic and depends only on non-floating-point columns in ORDER BY, it will still be applied before FINAL as an optimization, since such filtering cannot affect the deduplication result. Floating-point columns or columns containing floating-point (such as `Tuple(Float64, ...)`, `Array(Float64)`, `Nullable(Float64)`, etc.) are excluded because `-0.0` and `0.0` deduplicate as one key while a policy condition can tell them apart. Possible values: - 0 — Row policy is applied before FINAL. - 1 — Row policy is applied after FINAL (default).
   * @since 26.1
   */
  apply_row_policy_after_final?: boolean;

  /**
   * Whether the client should accept settings from server. This only affects operations performed on the client side, in particular parsing the INSERT input data and formatting the query result. Most of query execution happens on the server and is not affected by this setting. Normally this setting should be set in user profile (users.xml or queries like `ALTER USER`), not through the client (client command line arguments, `SET` query, or `SETTINGS` section of `SELECT` query). Through the client it can be changed to false, but can't be changed to true (because the server won't send the settings if user profile has `apply_settings_from_server = false`). Note that initially (24.12) there was a server setting (`send_settings_to_client`), but latter it got replaced with this client setting, for better usability.
   * @since 25.3
   */
  apply_settings_from_server?: boolean;

  /**
   * Push down substring search conditions on `String` columns from `PREWHERE` into the column scan. When a `PREWHERE` condition contains a conjunct that searches for a non-empty substring in a `String` (or `Nullable(String)`) column (`LIKE`, `position`, `startsWith`, `endsWith`, or equality with a non-empty string), the reader checks every value against this condition during deserialization and reads non-matching values as empty strings. This makes reading faster and lowers memory usage when the condition is selective, because the data of non-matching values is not copied into the column. The result of the query does not change, because the rows with non-matching values are guaranteed to be filtered out by `PREWHERE`, and such conditions never match an empty string. The filter is disabled adaptively at runtime if it turns out to be non-selective, or if the non-matching values are too short for skipping their data to pay off. Also allows the `WHERE` to `PREWHERE` optimization to move substring search conditions (`LIKE`, `position`, `startsWith`, `endsWith`) even when they use all queried columns (normally that is pointless, but with this setting the scan itself becomes cheaper). Equality with a constant string is not moved for this reason: it is still applied during the scan when it is already in `PREWHERE`. Supported for reading from `MergeTree` tables and from the `Parquet` format. In `Parquet`, the filter is applied to pages with the `PLAIN`, `DELTA_LENGTH_BYTE_ARRAY`, `DELTA_BYTE_ARRAY`, and dictionary encodings. Note that the estimation of the input bytes collected for the automatic decision about parallel replicas (`RuntimeDataflowStatisticsInputBytes`) is based on the in-memory size of the read blocks, so it underestimates the amount of data read from disk when the values are replaced by empty strings. Possible values: - 0 — Disabled. - 1 — Enabled.
   * @since 26.11
   */
  apply_string_filters_during_scan?: boolean;

  /**
   * Limits the maximum size of the adaptive buffer used when writing to archive files (for example, tar archives
   * @since 26.2
   */
  archive_adaptive_buffer_max_size_bytes?: bigint;

  /**
   * If enabled, function `arrayCount` returns `UInt32` as before version 26.10, instead of `UInt64`. The `UInt32` result silently wraps around for arrays with more than `4294967295` matching elements. The setting also restores the pre-26.10 constness of the result: a predicate folding to a constant false then produces a constant result column even for a non-constant array. During a rolling upgrade, enable it on the upgraded servers for the users under which distributed queries execute on them, to keep distributed queries initiated by not-yet-upgraded servers fully unchanged (an old initiator does not forward this setting, so type-sensitive expressions evaluated locally on upgraded shards would otherwise observe `UInt64`), and remove it after the upgrade is complete. Which user a shard-side query runs under depends on the cluster configuration: with an interserver `secret` configured, it is the initiator's current user; otherwise it is the user from the cluster definition or from the `remote` table function (`default` unless specified). The simplest robust approach is to enable the setting for all users of the upgraded servers.
   * @since 26.11
   */
  array_count_legacy_uint32_result?: boolean;

  /**
   * Type of descriptor to use for Arrow Flight requests. 'path' sends the dataset name as a path descriptor. 'command' sends a SQL query as a command descriptor (required for Dremio). Possible values: - 'path' — Use FlightDescriptor::Path (default, works with most Arrow Flight servers) - 'command' — Use FlightDescriptor::Command with a SELECT query (required for Dremio)
   * @since 25.12
   */
  arrow_flight_request_descriptor_type?: "path" | "command";

  /**
   * Timeout in seconds for a single Arrow Flight request. It bounds the whole request: for a read that is the entire result stream, not just the wait for the first record batch. Zero means no timeout, in which case a Flight server that accepts a request and never answers blocks the query until the connection is closed.
   * @since 26.11
   */
  arrow_flight_request_timeout_sec?: bigint;

  /**
   * When false (default), the server-side AST fuzzer (controlled by `ast_fuzzer_runs`) only fuzzes read-only queries (SELECT, EXPLAIN, SHOW, DESCRIBE, EXISTS). When true, all query types including DDL and INSERT are fuzzed.
   * @since 26.3
   */
  ast_fuzzer_any_query?: boolean;

  /**
   * When enabled together with `ast_fuzzer_runs`, applies a suite of correctness oracle checks to successfully executed fuzzed SELECT queries: TLP WHERE/DISTINCT/GROUP BY/HAVING/Aggregate, NoREC, DQP (toggling individual optimizer settings), Identity WHERE, and Subquery wrap. A mismatch throws an `AST_FUZZER_ORACLE_MISMATCH` exception.
   * @since 26.10
   */
  ast_fuzzer_oracle?: boolean;

  /**
   * Enables the server-side AST fuzzer that runs randomized queries after each normal query, discarding their results. - 0: disabled (default). - A value between 0 and 1 (exclusive): probability of running a single fuzzed query. - A value >= 1: the number of fuzzed queries to run per normal query. The fuzzer accumulates AST fragments from all queries across all sessions, producing increasingly interesting mutations over time. Fuzzed queries that fail are silently discarded; results are never returned to the client.
   * @since 26.3
   */
  ast_fuzzer_runs?: number;

  /**
   * Include [ALIAS](/reference/statements/create/table#alias) columns for wildcard query (`SELECT *`). Possible values: - 0 - disabled - 1 - enabled
   */
  asterisk_include_alias_columns?: boolean;

  /**
   * Include [MATERIALIZED](/reference/statements/create/view#materialized-view) columns for wildcard query (`SELECT *`). Possible values: - 0 - disabled - 1 - enabled
   */
  asterisk_include_materialized_columns?: boolean;

  /**
   * Include virtual columns for wildcard query (`SELECT *`). Possible values: - 0 - disabled - 1 - enabled
   * @since 26.5
   */
  asterisk_include_virtual_columns?: boolean;

  /**
   * If true, data from INSERT query is stored in queue and later flushed to table in background. If wait_for_async_insert is false, INSERT query is processed almost instantly, otherwise client will wait until data will be flushed to table
   */
  async_insert?: boolean;

  /**
   * The exponential growth rate at which the adaptive asynchronous insert timeout decreases
   */
  async_insert_busy_timeout_decrease_rate?: number;

  /**
   * The exponential growth rate at which the adaptive asynchronous insert timeout increases
   */
  async_insert_busy_timeout_increase_rate?: number;

  /**
   * Maximum time to wait before dumping collected data per query since the first data appeared. Cloud default value: `1000` (1s).
   */
  async_insert_busy_timeout_max_ms?: number;

  /**
   * If auto-adjusting is enabled through async_insert_use_adaptive_busy_timeout, minimum time to wait before dumping collected data per query since the first data appeared. It also serves as the initial value for the adaptive algorithm
   */
  async_insert_busy_timeout_min_ms?: number;

  /**
   * For async INSERT queries in the replicated table, specifies that deduplication of inserting blocks should be performed. This setting only takes effect when [`deduplicate_insert`](#deduplicate_insert) is set to `backward_compatible_choice`.
   */
  async_insert_deduplicate?: boolean;

  /**
   * Maximum size in bytes of unparsed data collected per query before being inserted Cloud default value: `104857600` (100 MiB).
   */
  async_insert_max_data_size?: bigint;

  /**
   * Maximum number of insert queries before being inserted. Only takes effect if setting [`async_insert_deduplicate`](#async_insert_deduplicate) is 1.
   */
  async_insert_max_query_number?: bigint;

  /**
   * Timeout for polling data from asynchronous insert queue
   */
  async_insert_poll_timeout_ms?: number;

  /**
   * Whether a user-initiated `INSERT ... SELECT` may use the asynchronous insert queue when `async_insert` is enabled and the query is eligible (a single small block into a `MergeTree`-family destination with no dependent views). When disabled, `INSERT ... SELECT` always runs synchronously regardless of `async_insert`. Internal inserts (refreshable materialized view, `POPULATE`, `CREATE TABLE ... AS SELECT`) are always synchronous and ignore this setting.
   * @since 26.11
   */
  async_insert_select_as_async_insert?: boolean;

  /**
   * If it is set to true, use adaptive busy timeout for asynchronous inserts
   */
  async_insert_use_adaptive_busy_timeout?: boolean;

  /**
   * Enables asynchronous connection creation and query sending while executing remote query. Enabled by default.
   */
  async_query_sending_for_remote?: boolean;

  /**
   * Enables asynchronous read from socket while executing remote query. Enabled by default.
   */
  async_socket_for_remote?: boolean;

  /**
   * How much of a query's read volume may be read by every replica instead of being split between them, as a fraction of the whole, before automatic parallel replicas declines the query. Only the read parallel replicas coordinate is split; every other read of the same subtree runs on each replica in full. Those reads take the same wall-clock time either way, so the cost-model comparison is blind to them, but the cluster performs `max_parallel_replicas` times as much work for them. This setting is the limit on that waste: at the default 0.5 a query whose coordinated read is less than half of what it reads keeps running on one node, however the time comparison turns out. Set to 1 to accept any amount of duplicated reading, which restores the behaviour of only comparing times.
   * @since 26.11
   */
  automatic_parallel_replicas_max_duplicated_read_ratio?: number;

  /**
   * Threshold of bytes to read per replica to enable parallel replicas automatically (applies only when `automatic_parallel_replicas_mode`=1). 0 means no threshold. The total number of bytes to read is estimated based on the collected statistics.
   * @since 26.1
   */
  automatic_parallel_replicas_min_bytes_per_replica?: bigint;

  /**
   * Enable automatic switching to execution with parallel replicas based on collected statistics. Requires `enable_parallel_replicas = 1`, `parallel_replicas_local_plan = 1` and providing `cluster_for_parallel_replicas`. With `enable_parallel_replicas = 2` parallel replicas are forced and the automatic mode is not applied. 0 - disabled, 1 - enabled, 2 - only statistics collection is enabled (switching to execution with parallel replicas is disabled).
   * @since 26.1
   */
  automatic_parallel_replicas_mode?: bigint;

  /**
   * Lets automatic parallel replicas remember, per query plan, where the replicas' share of the work ends, so that a repeated query whose statistics decline parallel replicas is decided without building the plan with parallel replicas. Disable it to make every query pay the full cost of the decision, e.g. when benchmarking that cost.
   * @since 26.11
   */
  automatic_parallel_replicas_remember_boundary?: boolean;

  /**
   * Use multiple threads for azure multipart upload.
   */
  azure_allow_parallel_part_upload?: boolean;

  /**
   * Check each uploaded object in azure blob storage to be sure that upload was successful
   * @since 24.12
   */
  azure_check_objects_after_upload?: boolean;

  /**
   * Connection timeout for host from azure disks.
   * @since 25.9
   */
  azure_connect_timeout_ms?: bigint;

  /**
   * Enables or disables creating a new file on each insert in azure engine tables
   */
  azure_create_new_file_on_insert?: boolean;

  /**
   * Ignore absence of file if it does not exist when reading certain keys. Possible values: - 1 — `SELECT` returns empty result. - 0 — `SELECT` throws an exception.
   */
  azure_ignore_file_doesnt_exist?: boolean;

  /**
   * Maximum number of files that could be returned in batch by ListObject request
   */
  azure_list_object_keys_size?: bigint;

  /**
   * Maximum number of blocks in multipart upload for Azure.
   */
  azure_max_blocks_in_multipart_upload?: bigint;

  /**
   * Max number of requests that can be issued simultaneously before hitting request per second limit. By default (0) equals to `azure_max_get_rps`
   * @since 25.9
   */
  azure_max_get_burst?: bigint;

  /**
   * Limit on Azure GET request per second rate before throttling. Zero means unlimited.
   * @since 25.9
   */
  azure_max_get_rps?: bigint;

  /**
   * The maximum number of a concurrent loaded parts in multipart upload request. 0 means unlimited.
   */
  azure_max_inflight_parts_for_one_file?: bigint;

  /**
   * Max number of requests that can be issued simultaneously before hitting request per second limit. By default (0) equals to `azure_max_put_rps`
   * @since 25.9
   */
  azure_max_put_burst?: bigint;

  /**
   * Limit on Azure PUT request per second rate before throttling. Zero means unlimited.
   * @since 25.9
   */
  azure_max_put_rps?: bigint;

  /**
   * Max number of azure redirects hops allowed.
   * @since 25.9
   */
  azure_max_redirects?: bigint;

  /**
   * The maximum size of object to copy using single part copy to Azure blob storage.
   */
  azure_max_single_part_copy_size?: bigint;

  /**
   * The maximum size of object to upload using singlepart upload to Azure blob storage.
   */
  azure_max_single_part_upload_size?: bigint;

  /**
   * The maximum number of retries during single Azure blob storage read.
   */
  azure_max_single_read_retries?: bigint;

  /**
   * The maximum number of retries in case of unexpected errors during Azure blob storage write
   */
  azure_max_unexpected_write_error_retries?: bigint;

  /**
   * The maximum size of part to upload during multipart upload to Azure blob storage.
   */
  azure_max_upload_part_size?: bigint;

  /**
   * The minimum size of part to upload during multipart upload to Azure blob storage.
   */
  azure_min_upload_part_size?: bigint;

  /**
   * Idleness timeout for sending and receiving data to/from azure. Fail if a single TCP read or write call blocks for this long.
   * @since 25.9
   */
  azure_request_timeout_ms?: bigint;

  /**
   * Maximum number of retries in azure sdk
   */
  azure_sdk_max_retries?: bigint;

  /**
   * Minimal backoff between retries in azure sdk
   */
  azure_sdk_retry_initial_backoff_ms?: bigint;

  /**
   * Maximal backoff between retries in azure sdk
   */
  azure_sdk_retry_max_backoff_ms?: bigint;

  /**
   * Enables or disables skipping empty files in S3 engine. Possible values: - 0 — `SELECT` throws an exception if empty file is not compatible with requested format. - 1 — `SELECT` returns empty result for empty file.
   */
  azure_skip_empty_files?: boolean;

  /**
   * The exact size of part to upload during multipart upload to Azure blob storage.
   */
  azure_strict_upload_part_size?: bigint;

  /**
   * Throw an error if matched zero files according to glob expansion rules. Possible values: - 1 — `SELECT` throws an exception. - 0 — `SELECT` returns empty result.
   */
  azure_throw_on_zero_files_match?: boolean;

  /**
   * Enables or disables truncate before insert in azure engine tables.
   */
  azure_truncate_on_insert?: boolean;

  /**
   * Multiply azure_min_upload_part_size by this factor each time azure_multiply_parts_count_threshold parts were uploaded from a single write to Azure blob storage.
   */
  azure_upload_part_size_multiply_factor?: bigint;

  /**
   * Each time this number of parts was uploaded to Azure blob storage, azure_min_upload_part_size is multiplied by azure_upload_part_size_multiply_factor.
   */
  azure_upload_part_size_multiply_parts_count_threshold?: bigint;

  /**
   * When set to `true` than for all azure requests first two attempts are made with low send and receive timeouts. When set to `false` than all attempts are made with identical timeouts.
   * @since 25.9
   */
  azure_use_adaptive_timeouts?: boolean;

  /**
   * When reading a blob from Azure Blob Storage through the `azureBlobStorage` / `azureBlobStorageCluster` table functions or the `AzureBlobStorage` table engine, pin every `GET` request to the generation of the blob that was observed when it was listed by sending its `ETag` in `If-Match`, and check the `ETag` of the response. A single file read issues many ranged `GET` requests; if the blob is overwritten in place between them (for example by an external writer rewriting a fixed key), the reads can otherwise be stitched together from two different generations of the blob and surface as a corrupted checksum or parse error. The size recorded at listing time is also used as the right bound of the read, so it is only correct for the generation it was recorded for. When a mismatch is detected the read fails with `AZURE_OBJECT_CHANGED_DURING_READ` instead of returning inconsistent data. Disable only for workloads that intentionally read blobs that are being overwritten and can tolerate inconsistent reads.
   * @since 26.11
   */
  azure_validate_etag_on_read?: boolean;

  /**
   * Maximum size of batch for multi request to [Zoo]Keeper during backup or restore
   */
  backup_restore_batch_size_for_keeper_multi?: bigint;

  /**
   * Maximum size of batch for multiread request to [Zoo]Keeper during backup or restore
   */
  backup_restore_batch_size_for_keeper_multiread?: bigint;

  /**
   * If a host during a BACKUP ON CLUSTER or RESTORE ON CLUSTER operation doesn't recreate its ephemeral 'alive' node in ZooKeeper for this amount of time then the whole backup or restore is considered as failed. This value should be bigger than any reasonable time for a host to reconnect to ZooKeeper after a failure. Zero means unlimited.
   * @since 24.12
   */
  backup_restore_failure_after_host_disconnected_for_seconds?: bigint;

  /**
   * How long the initiator should wait for other host to react to the 'error' node and stop their work on the current BACKUP ON CLUSTER or RESTORE ON CLUSTER operation.
   * @since 24.12
   */
  backup_restore_finish_timeout_after_error_sec?: bigint;

  /**
   * Approximate probability of failure for a keeper request during backup or restore. Valid value is in interval [0.0f, 1.0f]
   */
  backup_restore_keeper_fault_injection_probability?: number;

  /**
   * 0 - random seed, otherwise the setting value
   */
  backup_restore_keeper_fault_injection_seed?: bigint;

  /**
   * Max retries for [Zoo]Keeper operations in the middle of a BACKUP or RESTORE operation. Should be big enough so the whole operation won't fail because of a temporary [Zoo]Keeper failure.
   */
  backup_restore_keeper_max_retries?: bigint;

  /**
   * Max retries for [Zoo]Keeper operations while handling an error of a BACKUP ON CLUSTER or RESTORE ON CLUSTER operation.
   * @since 24.12
   */
  backup_restore_keeper_max_retries_while_handling_error?: bigint;

  /**
   * Max retries for [Zoo]Keeper operations during the initialization of a BACKUP ON CLUSTER or RESTORE ON CLUSTER operation.
   * @since 24.12
   */
  backup_restore_keeper_max_retries_while_initializing?: bigint;

  /**
   * Initial backoff timeout for [Zoo]Keeper operations during backup or restore
   */
  backup_restore_keeper_retry_initial_backoff_ms?: bigint;

  /**
   * Max backoff timeout for [Zoo]Keeper operations during backup or restore Cloud default value: `60000`.
   */
  backup_restore_keeper_retry_max_backoff_ms?: bigint;

  /**
   * Maximum size of data of a [Zoo]Keeper's node during backup
   */
  backup_restore_keeper_value_max_size?: bigint;

  /**
   * Setting for Aws::Client::RetryStrategy, Aws::Client does retries itself, 0 means no retries. It takes place only for backup/restore.
   */
  backup_restore_s3_retry_attempts?: bigint;

  /**
   * Initial backoff delay in milliseconds before the first retry attempt during backup and restore. Each subsequent retry increases the delay exponentially, up to the maximum specified by `backup_restore_s3_retry_max_backoff_ms`
   * @since 25.9
   */
  backup_restore_s3_retry_initial_backoff_ms?: bigint;

  /**
   * Jitter factor applied to the retry backoff delay in Aws::Client::RetryStrategy during backup and restore operations. The computed backoff delay is multiplied by a random factor in the range [1.0, 1.0 + jitter], up to the maximum `backup_restore_s3_retry_max_backoff_ms`. Must be in [0.0, 1.0] interval
   * @since 25.9
   */
  backup_restore_s3_retry_jitter_factor?: number;

  /**
   * Maximum delay in milliseconds between retries during backup and restore operations.
   * @since 25.9
   */
  backup_restore_s3_retry_max_backoff_ms?: bigint;

  /**
   * Maximum time in milliseconds to retry an S3 request whose response identifies `ExpiredToken` during backup or restore. Retries also stop at `backup_restore_s3_retry_attempts`. Zero disables these retries. AWS S3 `HEAD` responses expose only a generic HTTP status, so this retry does not cover `HEAD` metadata requests.
   * @since 26.11
   */
  backup_s3_expired_token_retry_timeout_ms?: bigint;

  /**
   * When set to `true`, all threads executing S3 requests to the same backup endpoint are slowed down after any single S3 request encounters a retryable S3 error, such as 'Slow Down'. When set to `false`, each thread handles s3 request backoff independently of the others.
   * @since 25.9
   */
  backup_slow_all_threads_after_retryable_s3_error?: boolean;

  /**
   * Only has an effect in ClickHouse Cloud. Number of background threads for speculatively downloading new data parts into the filesystem cache, when [cache_populated_by_fetch](/reference/settings/merge-tree-settings/cache-populated-by-fetch#cache_populated_by_fetch) is enabled. Zero to disable.
   */
  cache_warmer_threads?: bigint;

  /**
   * Calculate text stack trace in case of exceptions during query execution. This is the default. It requires symbol lookups that may slow down fuzzing tests when a huge amount of wrong queries are executed. In normal cases, you should not disable this option.
   */
  calculate_text_stack_trace?: boolean;

  /**
   * Cancels HTTP read-only queries (e.g. SELECT) when a client closes the connection without waiting for the response. Cloud default value: `1`.
   */
  cancel_http_readonly_queries_on_client_close?: boolean;

  /**
   * Consider pushing partial aggregation below a join (eager aggregation) as a cost-based alternative in the Cascades optimizer. Takes effect only together with `enable_cascades_optimizer = 1` and `make_distributed_plan = 1`.
   * @since 26.10
   */
  cascades_aggregation_pushdown?: boolean;

  /**
   * CAST operator into IPv4, CAST operator into IPV6 type, toIPv4, toIPv6 functions will return default value instead of throwing exception on conversion error.
   */
  cast_ipv4_ipv6_default_on_conversion_error?: boolean;

  /**
   * Enables or disables keeping of the `Nullable` data type in [CAST](/reference/functions/regular-functions/type-conversion-functions#CAST) operations. When the setting is enabled and the argument of `CAST` function is `Nullable`, the result is also transformed to `Nullable` type. When the setting is disabled, the result always has the destination type exactly. Possible values: - 0 — The `CAST` result has exactly the destination type specified. - 1 — If the argument type is `Nullable`, the `CAST` result is transformed to `Nullable(DestinationDataType)`. **Examples** The following query results in the destination data type exactly: ```sql SET cast_keep_nullable = 0; SELECT CAST(toNullable(toInt32(0)) AS Int32) as x, toTypeName(x); ``` Result: ```text ┌─x─┬─toTypeName(CAST(toNullable(toInt32(0)), 'Int32'))─┐ │ 0 │ Int32 │ └───┴───────────────────────────────────────────────────┘ ``` The following query results in the `Nullable` modification on the destination data type: ```sql SET cast_keep_nullable = 1; SELECT CAST(toNullable(toInt32(0)) AS Int32) as x, toTypeName(x); ``` Result: ```text ┌─x─┬─toTypeName(CAST(toNullable(toInt32(0)), 'Int32'))─┐ │ 0 │ Nullable(Int32) │ └───┴───────────────────────────────────────────────────┘ ``` **See Also** - [CAST](/reference/functions/regular-functions/type-conversion-functions#CAST) function
   */
  cast_keep_nullable?: boolean;

  /**
   * Allows choosing a parser of the text representation of date and time during cast from String. Possible values: - `'best_effort'` — Enables extended parsing. ClickHouse can parse the basic `YYYY-MM-DD HH:MM:SS` format and all [ISO 8601](https://en.wikipedia.org/wiki/ISO_8601) date and time formats. For example, `'2018-06-08T01:02:03.000Z'`. - `'best_effort_us'` — Similar to `best_effort` (see the difference in [parseDateTimeBestEffortUS](/reference/functions/regular-functions/type-conversion-functions#parseDateTimeBestEffortUS) - `'basic'` — Use basic parser. ClickHouse can parse only the basic `YYYY-MM-DD HH:MM:SS` or `YYYY-MM-DD` format. For example, `2019-08-20 10:18:56` or `2019-08-20`. See also: - [DateTime data type.](/reference/data-types/datetime) - [Functions for working with dates and times.](/reference/functions/regular-functions/date-time-functions)
   * @since 25.7
   */
  cast_string_to_date_time_mode?: "basic" | "best_effort" | "best_effort_us";

  /**
   * Use types inference during String to Dynamic conversion
   */
  cast_string_to_dynamic_use_inference?: boolean;

  /**
   * Use types inference during String to Variant conversion.
   * @since 25.5
   */
  cast_string_to_variant_use_inference?: boolean;

  /**
   * Check that DROP NAMED COLLECTION will not break tables that depend on it
   * @since 26.3
   */
  check_named_collection_dependencies?: boolean;

  /**
   * Defines the level of detail for the [CHECK TABLE](/reference/statements/check-table) query result for `MergeTree` family engines . Possible values: - 0 — the query shows a check status for every individual data part of a table. - 1 — the query shows the general table check status.
   */
  check_query_single_value_result?: boolean;

  /**
   * Check that DDL query (such as DROP TABLE or RENAME) will not break referential dependencies
   */
  check_referential_table_dependencies?: boolean;

  /**
   * Check that DDL query (such as DROP TABLE or RENAME) will not break dependencies
   */
  check_table_dependencies?: boolean;

  /**
   * Validate checksums on reading. It is enabled by default and should be always enabled in production. Please do not expect any benefits in disabling this setting. It may only be used for experiments and benchmarks. The setting is only applicable for tables of MergeTree family. Checksums are always validated for other table engines and when receiving data over the network.
   */
  checksum_on_read?: boolean;

  /**
   * Cloud mode Cloud default value: `1`.
   */
  cloud_mode?: boolean;

  /**
   * The engine family allowed in Cloud. - 0 - allow everything - 1 - rewrite DDLs to use *ReplicatedMergeTree - 2 - rewrite DDLs to use SharedMergeTree - 3 - rewrite DDLs to use SharedMergeTree except when explicitly passed remote disk is specified - 4 - same as 3, plus additionally use Alias instead of Distributed (the Alias table will point to the destination table of the Distributed table, so it will use the corresponding local table) UInt64 to minimize public part Cloud default value: `2`.
   */
  cloud_mode_engine?: bigint;

  /**
   * Cluster for a shard in which current server is located Cloud default value: `default`.
   */
  cluster_for_parallel_replicas?: string;

  /**
   * If set to `true`, increases performance of processing archives in cluster functions. Should be set to `false` for compatibility and to avoid errors during upgrade to 25.7+ if using cluster functions with archives on earlier versions.
   * @since 25.8
   */
  cluster_function_process_archive_on_multiple_nodes?: boolean;

  /**
   * How long the initiator of a `*Cluster` table function or of parallel replicas over object storage waits for a replica to ask for tasks before giving the files assigned to that replica to other replicas. `0` disables the wait.
   * @since 26.11
   */
  cluster_function_wait_for_replica_ms?: number;

  /**
   * Defines the approximate size of a batch (in bytes) used in distributed processing of tasks in cluster table functions with `bucket` split granularity. The system accumulates data until at least this amount is reached. The actual size may be slightly larger to align with data boundaries.
   * @since 25.12
   */
  cluster_table_function_buckets_batch_size?: bigint;

  /**
   * Controls how data is split into tasks when executing a CLUSTER TABLE FUNCTION. This setting defines the granularity of work distribution across the cluster: - `file` — each task processes an entire file. - `bucket` — tasks are created per internal data block within a file (for example, Parquet row groups). Choosing finer granularity (like `bucket`) can improve parallelism when working with a small number of large files. For instance, if a Parquet file contains multiple row groups, enabling `bucket` granularity allows each group to be processed independently by different workers.
   * @since 25.12
   */
  cluster_table_function_split_granularity?: "file" | "bucket";

  /**
   * Enable collecting hash table statistics to optimize memory allocation
   */
  collect_hash_table_stats_during_aggregation?: boolean;

  /**
   * Enable collecting hash table statistics to optimize memory allocation
   */
  collect_hash_table_stats_during_joins?: boolean;

  /**
   * Soft per-query threshold on the bytes a single query writes to the columns cache. The bytes written during the query are counted, and once the counter reaches this value, further cache writes for the rest of the query are skipped. This is an advisory threshold, not a hard cap: a reader accumulates the entries of the granules it has read and writes them to the cache in one batch, and the batch that crosses the threshold is stored in full before the counter is charged. So the actual amount written may exceed this value by up to the entries one reader accumulates between two writes - the columns it reads, one entry per stripe of about 65536 rows each - and, with several readers running at once, by that much per reader. The purpose is to keep a single large scan from displacing useful data from the cache, not to bound cache usage exactly. A value of `0` means use half of the size limit the columns cache currently has: the configured `columns_cache_size`, or less while the cache is shrunk under memory pressure (see the `ColumnsCacheSizeLimit` metric).
   * @since 26.11
   */
  columns_cache_max_bytes_to_write_to_cache?: bigint;

  /**
   * If the estimated size of the data a query reads from `MergeTree` parts exceeds this value, writes to the columns cache are inhibited for the entire query. The estimate is made in uncompressed bytes, which is what the cache is charged for, from the size of the columns the query reads (including `PREWHERE`, mutation and patch-part columns) scaled to the selected mark ranges, and the query is charged for all of it before it reads anything. This keeps a single large scan from displacing useful data from the cache, and from copying data into the cache that cannot stay there. A value of `0` means use half of the size limit the columns cache currently has. That is the configured `columns_cache_size` while the server has memory to spare, but the cache shrinks under memory pressure (see the `ColumnsCacheSizeLimit` metric), and the default budget shrinks with it. With the default `columns_cache_size_ratio`, half of the limit is the size of the probationary segment of the cache, so the data of a query that passes the gate can be cached completely in one pass. The gate does not apply to a read that drops mark ranges while it runs, which is the case when `use_indexes_refiner_in_read_pools` is enabled: how many of the selected marks such a read really touches is decided only when each task is cut, so the estimate above would be an upper bound that charges marks the query never reads. For those reads the amount written is bounded by `columns_cache_max_bytes_to_write_to_cache` instead.
   * @since 26.11
   */
  columns_cache_max_estimated_bytes_to_write_to_cache?: bigint;

  /**
   * The `compatibility` setting causes ClickHouse to use the default settings of a previous version of ClickHouse, with exceptions recorded in the settings changes history. If settings are set to non-default values, then those settings are honored (only settings that have not been modified are affected by the `compatibility` setting). The `compatibility` setting never applies a value that the user could not set: a setting keeps its default if the previous version's default would violate the [constraints](/concepts/features/configuration/settings/constraints-on-settings) of the user's settings profiles, or if the setting belongs to a tier that [`allow_feature_tier`](/reference/settings/server-settings/settings/allow#allow_feature_tier) disables. Changes marked `Ignore` in [`system.settings_changes`](/reference/system-tables/settings_changes) block rollback of that change and all earlier changes to the same setting. This setting takes a ClickHouse version number as a string, like `22.3`, `22.8`. An empty value means that this setting is disabled. Disabled by default. <Note> In ClickHouse Cloud, the service-level default compatibility setting must be set by ClickHouse Cloud support. Please [open a case](https://clickhouse.cloud/support) to have it set. However, the compatibility setting can be overridden at the user, role, profile, query, or session level using standard ClickHouse setting mechanisms such as `SET compatibility = '22.3'` in a session or `SETTINGS compatibility = '22.3'` in a query. </Note>
   */
  compatibility?: string;

  /**
   * Ignore AUTO_INCREMENT keyword in column declaration if true, otherwise return error. It simplifies migration from MySQL
   */
  compatibility_ignore_auto_increment_in_create_table?: boolean;

  /**
   * Compatibility ignore collation in create table
   */
  compatibility_ignore_collation_in_create_table?: boolean;

  /**
   * Compatibility: when enabled, folds pre-signed URL query parameters (e.g. X-Amz-*) into the S3 key (legacy behavior), so '?' acts as a wildcard in the path. When disabled (default), pre-signed URL query parameters are kept in the URL query to avoid interpreting '?' as a wildcard.
   * @since 26.1
   */
  compatibility_s3_presigned_url_query_in_path?: boolean;

  /**
   * Enables or disables JIT-compilation of aggregate functions to native code. Enabling this setting can improve the performance. Possible values: - 0 — Aggregation is done without JIT compilation. - 1 — Aggregation is done using JIT compilation. **See Also** - [min_count_to_compile_aggregate_expression](#min_count_to_compile_aggregate_expression)
   */
  compile_aggregate_expressions?: boolean;

  /**
   * Compile some scalar functions and operators to native code.
   */
  compile_expressions?: boolean;

  /**
   * Compile simple regular expressions used in functions like `match` and `extract` to native code. Patterns outside the supported subset transparently fall back to the general engine.
   * @since 26.8
   */
  compile_regular_expressions?: boolean;

  /**
   * Compile sort description to native code.
   */
  compile_sort_description?: boolean;

  /**
   * Applies a generic compression to the response body, e.g., `compression=gz`. Note this is independent of `Content-Encoding` (HTTP compression) and the legacy `compress` parameter (ClickHouse-native compression). Specifying a compressed file extension in the URL path is equivalent. This is an HTTP-interface response-shaping setting: it is consumed before the query is executed (the response buffers are set up up-front), so it must be supplied via the HTTP URL parameter, the URL path file extension, or a user profile, not via an in-query `SETTINGS` clause (where it has no effect and is rejected).
   * @since 26.9
   */
  compression?: string;

  /**
   * Connection timeout if there are no replicas.
   */
  connect_timeout?: number;

  /**
   * The timeout in milliseconds for connecting to a remote server for a Distributed table engine, if the 'shard' and 'replica' sections are used in the cluster definition. If unsuccessful, several attempts are made to connect to various replicas.
   */
  connect_timeout_with_failover_ms?: number;

  /**
   * Connection timeout for selecting first healthy replica (for secure connections).
   */
  connect_timeout_with_failover_secure_ms?: number;

  /**
   * The wait time in milliseconds for a connection when the connection pool is full. The wait applies per replica, because there is one connection pool per replica. When it expires the attempt fails with `NO_FREE_CONNECTION`. On the failover path used by distributed `SELECT`s that is treated like any other unusable replica: the query tries the remaining replicas, and only fails with `ALL_CONNECTION_TRIES_FAILED` once every one of them has been tried. So this setting does not bound the whole query; with `N` replicas and `T` tries each, the total wait can reach `connection_pool_max_wait_ms` times `N` times `T`, where `T` is [connections_with_failover_max_tries](#connections_with_failover_max_tries) but never less than one, because a replica is always tried once before it is written off. Use [max_execution_time](/reference/settings/session-settings/max-execution#max_execution_time) to bound the query itself. `skip_unavailable_shards` does not silence this: a replica the initiator had no free connection slot for was never contacted, so the shard is not treated as unavailable. Possible values: - Positive integer. - 0 — Infinite timeout. The wait is still interrupted by `KILL QUERY`, and by `max_execution_time` at the default [timeout_overflow_mode](/reference/settings/session-settings/timeout-overflow-mode#timeout_overflow_mode) `throw`. Under `break` the time limit does not cancel the query, so the wait continues until a connection is released; `KILL QUERY` still interrupts it.
   */
  connection_pool_max_wait_ms?: number;

  /**
   * The maximum number of connection attempts with each replica for the Distributed table engine.
   */
  connections_with_failover_max_tries?: bigint;

  /**
   * When set to `true`, a `SELECT` query will be converted to conjuctive normal form (CNF). There are scenarios where rewriting a query in CNF may execute faster (view this [Github issue](https://github.com/ClickHouse/ClickHouse/issues/11749) for an explanation). For example, notice how the following `SELECT` query is not modified (the default behavior): ```sql EXPLAIN SYNTAX SELECT * FROM ( SELECT number AS x FROM numbers(20) ) AS a WHERE ((x >= 1) AND (x <= 5)) OR ((x >= 10) AND (x <= 15)) SETTINGS convert_query_to_cnf = false; ``` The result is: ```response ┌─explain────────────────────────────────────────────────────────┐ │ SELECT x │ │ FROM │ │ ( │ │ SELECT number AS x │ │ FROM numbers(20) │ │ WHERE ((x >= 1) AND (x <= 5)) OR ((x >= 10) AND (x <= 15)) │ │ ) AS a │ │ WHERE ((x >= 1) AND (x <= 5)) OR ((x >= 10) AND (x <= 15)) │ │ SETTINGS convert_query_to_cnf = 0 │ └────────────────────────────────────────────────────────────────┘ ``` Let's set `convert_query_to_cnf` to `true` and see what changes: ```sql EXPLAIN SYNTAX SELECT * FROM ( SELECT number AS x FROM numbers(20) ) AS a WHERE ((x >= 1) AND (x <= 5)) OR ((x >= 10) AND (x <= 15)) SETTINGS convert_query_to_cnf = true; ``` Notice the `WHERE` clause is rewritten in CNF, but the result set is the identical - the Boolean logic is unchanged: ```response ┌─explain───────────────────────────────────────────────────────────────────────────────────────────────────────────────┐ │ SELECT x │ │ FROM │ │ ( │ │ SELECT number AS x │ │ FROM numbers(20) │ │ WHERE ((x <= 15) OR (x <= 5)) AND ((x <= 15) OR (x >= 1)) AND ((x >= 10) OR (x <= 5)) AND ((x >= 10) OR (x >= 1)) │ │ ) AS a │ │ WHERE ((x >= 10) OR (x >= 1)) AND ((x >= 10) OR (x <= 5)) AND ((x <= 15) OR (x >= 1)) AND ((x <= 15) OR (x <= 5)) │ │ SETTINGS convert_query_to_cnf = 1 │ └───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘ ``` Possible values: true, false
   */
  convert_query_to_cnf?: boolean;

  /**
   * Controls the kind of joins in the decorrelated query plan. The default value is `right`, which means that decorrelated plan will contain RIGHT JOINs with subquery input on the right side. Possible values: - `left` - Decorrelation process will produce LEFT JOINs and input table will appear on the left side. - `right` - Decorrelation process will produce RIGHT JOINs and input table will appear on the right side. When the subquery input is shared through an in-memory buffer (see `correlated_subqueries_use_in_memory_buffer`), `right` is used regardless of this setting, because only that layout evaluates the buffer writer before its reader. The join kind is an internal detail of the decorrelated plan and does not change the result.
   * @since 25.12
   */
  correlated_subqueries_default_join_kind?: "left" | "right";

  /**
   * Use filter expressions to inference equivalent expressions and substitute them instead of creating a CROSS JOIN.
   * @since 25.8
   */
  correlated_subqueries_substitute_equivalent_expressions?: boolean;

  /**
   * Use in-memory buffer for correlated subquery input to avoid its repeated evaluation.
   * @since 26.2
   */
  correlated_subqueries_use_in_memory_buffer?: boolean;

  /**
   * Specifies which of the `uniq*` functions should be used to perform the [COUNT(DISTINCT ...)](/reference/functions/aggregate-functions/count) construction. Possible values: - [uniq](/reference/functions/aggregate-functions/uniq) - [uniqCombined](/reference/functions/aggregate-functions/uniqCombined) - [uniqCombined64](/reference/functions/aggregate-functions/uniqCombined64) - [uniqHLL12](/reference/functions/aggregate-functions/uniqHLL12) - [uniqExact](/reference/functions/aggregate-functions/uniqExact)
   */
  count_distinct_implementation?: string;

  /**
   * Rewrite count distinct to subquery of group by
   */
  count_distinct_optimization?: boolean;

  /**
   * Stop counting once a pattern matches zero-length in the `countMatches` function.
   * @since 25.8
   */
  count_matches_stop_at_empty_match?: boolean;

  /**
   * Enable `IF NOT EXISTS` for `CREATE` statement by default. If either this setting or `IF NOT EXISTS` is specified and a table with the provided name already exists, no exception will be thrown.
   */
  create_if_not_exists?: boolean;

  /**
   * Ignore UNIQUE keyword in CREATE UNIQUE INDEX. Made for SQL compatibility tests.
   */
  create_index_ignore_unique?: boolean;

  /**
   * The probability of a fault injection during table creation after creating metadata in ZooKeeper
   */
  create_replicated_merge_tree_fault_injection_probability?: number;

  /**
   * Allow to create *MergeTree tables with empty primary key when ORDER BY and PRIMARY KEY not specified
   */
  create_table_empty_primary_key_by_default?: boolean;

  /**
   * The lifetime, in seconds, given to a token created by [`CREATE TOKEN`](/reference/statements/create/token) which does not specify its own `VALID UNTIL` or `VALID FOR` clause. The default is 30 minutes, so a token that is not asked to live longer is short-lived. Possible values: - Positive integer — the token expires this many seconds after it is created. - 0 — a token without an explicit clause never expires. This is only a default. An explicit `VALID UNTIL` or `VALID FOR` clause of the query always wins, including `VALID UNTIL 'infinity'`, which creates a token that never expires regardless of this setting.
   * @since 26.10
   */
  create_token_default_ttl_seconds?: bigint;

  /**
   * Minimal size of block to compress in CROSS JOIN, and in the [block nested loop join](/reference/statements/select/join#join-with-an-arbitrary-on-condition), which materializes its right side the same way. Zero value means - disable this threshold. This block is compressed when any of the two thresholds (by rows or by bytes) are reached.
   */
  cross_join_min_bytes_to_compress?: bigint;

  /**
   * Minimal count of rows to compress block in CROSS JOIN, and in the [block nested loop join](/reference/statements/select/join#join-with-an-arbitrary-on-condition), which materializes its right side the same way. Zero value means - disable this threshold. This block is compressed when any of the two thresholds (by rows or by bytes) are reached.
   */
  cross_join_min_rows_to_compress?: bigint;

  /**
   * Use inner join instead of comma/cross join if there are joining expressions in the WHERE section. Values: 0 - no rewrite, 1 - apply if possible for comma/cross, 2 - force rewrite all comma joins, cross - if possible
   * @since 26.2
   */
  cross_to_inner_join_rewrite?: bigint;

  /**
   * Allows data types without explicit modifiers [NULL or NOT NULL](/reference/statements/create/table#null-or-not-null-modifiers) in column definition will be [Nullable](/reference/data-types/nullable). It applies to `CREATE TABLE`, `ALTER TABLE ... ADD COLUMN` and `ALTER TABLE ... MODIFY COLUMN`. Possible values: - 1 — The data types in column definitions are set to `Nullable` by default. - 0 — The data types in column definitions are set to not `Nullable` by default.
   */
  data_type_default_nullable?: boolean;

  /**
   * Sets the current database for the query — the database in which unqualified table names are resolved, the same effect as `USE <database>`. Unlike the `USE` statement, this is an ordinary session setting: like any other setting it accepts a value without validating it, and an unknown database is reported when the setting takes effect (when a query runs), not at `SET` time. It follows the privilege contract of the client-supplied default database (which it generalizes), not of `USE`: selecting the current database does not require the `SHOW_DATABASES` privilege, while access to the tables inside it is checked as usual. Used as the destination for the HTTP interface `database` URL parameter and the `X-ClickHouse-Database` header.
   * @since 26.9
   */
  database?: string;

  /**
   * Adds a modifier `SYNC` to all `DROP` and `DETACH` queries. Possible values: - 0 — Queries will be executed with delay. - 1 — Queries will be executed without delay.
   */
  database_atomic_wait_for_drop_and_detach_synchronously?: boolean;

  /**
   * Either to throw error or not if we don't have rights to get table's metadata in database engine DataLakeCatalog.
   * @since 26.2
   */
  database_datalake_require_metadata_access?: boolean;

  /**
   * 0 - Don't allow to explicitly specify UUIDs for tables in Replicated databases. 1 - Allow. 2 - Allow, but ignore the specified UUID and generate a random one instead.
   */
  database_replicated_allow_explicit_uuid?: bigint;

  /**
   * Allow long-running DDL queries (CREATE AS SELECT and POPULATE) in Replicated database engine. Note that it can block DDL queue for a long time.
   */
  database_replicated_allow_heavy_create?: boolean;

  /**
   * Allow to create only Replicated tables in database with engine Replicated Cloud default value: `1`.
   */
  database_replicated_allow_only_replicated_engine?: boolean;

  /**
   * 0 - Don't allow to explicitly specify ZooKeeper path and replica name for *MergeTree tables in Replicated databases. 1 - Allow. 2 - Allow, but ignore the specified path and use default one instead. 3 - Allow and don't log a warning.
   */
  database_replicated_allow_replicated_engine_arguments?: bigint;

  /**
   * Execute DETACH TABLE as DETACH TABLE PERMANENTLY if database engine is Replicated
   */
  database_replicated_always_detach_permanently?: boolean;

  /**
   * Enforces synchronous waiting for some queries (see also database_atomic_wait_for_drop_and_detach_synchronously, mutations_sync, alter_sync). Not recommended to enable these settings.
   */
  database_replicated_enforce_synchronous_settings?: boolean;

  /**
   * Sets how long initial DDL query should wait for Replicated database to process previous DDL queue entries in seconds. Possible values: - Positive integer. - 0 — Unlimited.
   */
  database_replicated_initial_query_timeout_sec?: bigint;

  /**
   * The delay in seconds before a dropped table is actually removed from a Shared database. This allows to recover the table within this time using `UNDROP TABLE` statement.
   * @since 25.12
   */
  database_shared_drop_table_delay_seconds?: bigint;

  /**
   * If the dead blobs queues of the destination table's disks contain at least that many blobs pending removal, artificially slow down insert into table. 0 - use the table setting.
   * @since 26.8
   */
  dead_blobs_to_delay_insert?: bigint;

  /**
   * If the dead blobs queues of the destination table's disks contain more than this number of blobs pending removal, throw 'Too many dead blobs ...' exception. 0 - use the table setting.
   * @since 26.8
   */
  dead_blobs_to_throw_insert?: bigint;

  /**
   * Check overflow of decimal arithmetic/comparison operations
   */
  decimal_check_overflow?: boolean;

  /**
   * Enables or disables the deduplication check for materialized views that receive data from Replicated* tables. Possible values: - 0 — Disabled. - 1 — Enabled. When enabled, ClickHouse performs deduplication of blocks in materialized views that depend on Replicated* tables. This setting is useful for ensuring that materialized views do not contain duplicate data when the insertion operation is being retried due to a failure. **See Also** - [NULL Processing in IN Operators](/concepts/features/operations/insert/deduplicating-inserts-on-retries#insert-deduplication-with-materialized-views)
   */
  deduplicate_blocks_in_dependent_materialized_views?: boolean;

  /**
   * Enables or disables block deduplication of `INSERT INTO` (for Replicated* tables). The setting applies to both synchronous and asynchronous inserts, and it supersedes the `insert_deduplicate` and `async_insert_deduplicate` settings. That setting has three possible values: - disable — Deduplication is disabled for `INSERT INTO` query. - enable — Deduplication is enabled for `INSERT INTO` query. - backward_compatible_choice — Deduplication is enabled if `insert_deduplicate` or `async_insert_deduplicate` are enabled for specific insert type. For `INSERT SELECT` queries, [`deduplicate_insert_select`](#deduplicate_insert_select) is consulted first. Deduplication also requires the destination table to keep a deduplication log, see [replicated_deduplication_window](/reference/settings/merge-tree-settings/replicated-deduplication-window#replicated_deduplication_window) and [non_replicated_deduplication_window](/reference/settings/merge-tree-settings/other#non_replicated_deduplication_window).
   * @since 26.3
   */
  deduplicate_insert?: "backward_compatible_choice" | "enable" | "disable";

  /**
   * Enables or disables block deduplication of `INSERT SELECT` (for Replicated* tables). For `INSERT SELECT` queries this setting is consulted before [`deduplicate_insert`](#deduplicate_insert). A `SELECT` is stable when it carries `ORDER BY ALL` and its pipeline ends in a single stream. A non-empty [`insert_deduplication_token`](#insert_deduplication_token) is an equivalent substitute for stability. That setting has four possible values: - disable — Deduplication is disabled for `INSERT SELECT` query. - force_enable — Deduplication is enabled for `INSERT SELECT` query, regardless of `deduplicate_insert`. If select result is not stable and no token is provided, exception is thrown. - enable_when_possible — Deduplication is enabled if it is enabled by `deduplicate_insert` and the select result is stable, otherwise disabled. - enable_even_for_bad_queries - Deduplication is enabled if it is enabled by `deduplicate_insert`, regardless of whether the select result is stable. If select result is not stable, a message is logged, but query is executed with deduplication. This option is for backward compatibility. Consider to use other options instead as it may lead to unexpected results.
   * @since 26.2
   */
  deduplicate_insert_select?:
    | "enable_when_possible"
    | "force_enable"
    | "disable"
    | "enable_even_for_bad_queries";

  /**
   * Specifies the format of the query result when the query has no `FORMAT` clause and no other format override is applied.
   * @since 26.9
   */
  default_format?: string;

  /**
   * Allows to set a default value for SQL SECURITY option when creating a materialized view. [More about SQL security](/reference/statements/create/view#sql_security). The default value is `DEFINER`.
   */
  default_materialized_view_sql_security?: "DEFINER" | "INVOKER" | "NONE";

  /**
   * Maximum size of right-side table if limit is required but `max_bytes_in_join` is not set.
   */
  default_max_bytes_in_join?: bigint;

  /**
   * Allows to set default `SQL SECURITY` option while creating a normal view. [More about SQL security](/reference/statements/create/view#sql_security). The default value is `INVOKER`.
   */
  default_normal_view_sql_security?: "DEFINER" | "INVOKER" | "NONE";

  /**
   * Default table engine to use when `ENGINE` is not set in a `CREATE` statement. Possible values: - a string representing any valid table engine name Cloud default value: `SharedMergeTree`. **Example** Query: ```sql SET default_table_engine = 'Log'; SELECT name, value, changed FROM system.settings WHERE name = 'default_table_engine'; ``` Result: ```response ┌─name─────────────────┬─value─┬─changed─┐ │ default_table_engine │ Log │ 1 │ └──────────────────────┴───────┴─────────┘ ``` In this example, any new table that does not specify an `Engine` will use the `Log` table engine: Query: ```sql CREATE TABLE my_table ( x UInt32, y UInt32 ); SHOW CREATE TABLE my_table; ``` Result: ```response ┌─statement────────────────────────────────────────────────────────────────┐ │ CREATE TABLE default.my_table ( `x` UInt32, `y` UInt32 ) ENGINE = Log └──────────────────────────────────────────────────────────────────────────┘ ```
   */
  default_table_engine?: string;

  /**
   * Same as [default_table_engine](#default_table_engine) but for temporary tables. In this example, any new temporary table that does not specify an `Engine` will use the `Log` table engine: Query: ```sql SET default_temporary_table_engine = 'Log'; CREATE TEMPORARY TABLE my_table ( x UInt32, y UInt32 ); SHOW CREATE TEMPORARY TABLE my_table; ``` Result: ```response ┌─statement────────────────────────────────────────────────────────────────┐ │ CREATE TEMPORARY TABLE default.my_table ( `x` UInt32, `y` UInt32 ) ENGINE = Log └──────────────────────────────────────────────────────────────────────────┘ ```
   */
  default_temporary_table_engine?: string;

  /**
   * Allows to set default `DEFINER` option while creating a view. [More about SQL security](/reference/statements/create/view#sql_security). The default value is `CURRENT_USER`.
   */
  default_view_definer?: string;

  /**
   * When enabled (default), partition pruning is skipped for `FINAL` queries on tables whose partition-key columns are not part of the sorting key. This is the correctness-safe behavior introduced in 26.3: `FINAL` may need to deduplicate rows that share a primary key but live in different partitions, and partition pruning would silently exclude such rows from the deduplication input. When disabled, partition pruning is applied even with `FINAL`, restoring the pre-26.3 behavior. This can be substantially faster for queries with `WHERE` predicates on the partition column, but is only correct when rows with the same primary key cannot exist in different partitions — e.g. event-log tables whose partition column is set at insert time and never changes. This setting only affects partitioned tables whose partition-key columns are not contained in the sorting key; for other tables partition pruning is always applied. Possible values: - 0 — Apply partition pruning before `FINAL` (pre-26.3 behavior, faster but unsafe in the general case). - 1 — Defer partition pruning to after `FINAL` (default, correctness-safe).
   * @since 26.6
   */
  defer_partition_pruning_after_final?: boolean;

  /**
   * When writing to a DeltaLake table, cast each value to the Delta write-schema type with an accurate cast that throws when a value does not fit the target type, instead of a plain cast that silently truncates it (e.g. `300` written into a Delta `byte` column). Set to `false`, or use a `compatibility` setting below 26.9, for the plain, non-throwing cast.
   * @since 26.10
   */
  delta_lake_accurate_write_cast?: boolean;

  /**
   * Enables delta-kernel internal data pruning.
   * @since 25.9
   */
  delta_lake_enable_engine_predicate?: boolean;

  /**
   * Enables Test level logs of DeltaLake expression visitor. These logs can be too verbose even for test logging.
   * @since 25.9
   */
  delta_lake_enable_expression_visitor_logging?: boolean;

  /**
   * Defines a bytes limit for a single inserted data file in delta lake.
   * @since 25.10
   */
  delta_lake_insert_max_bytes_in_data_file?: bigint;

  /**
   * Defines a rows limit for a single inserted data file in delta lake.
   * @since 25.10
   */
  delta_lake_insert_max_rows_in_data_file?: bigint;

  /**
   * Enables logging delta lake metadata files into system table.
   * @since 25.11
   */
  delta_lake_log_metadata?: boolean;

  /**
   * If enabled, schema is reloaded from the DeltaLake metadata before each query execution to ensure consistency between the schema used during query analysis and the schema used during execution.
   * @since 26.4
   */
  delta_lake_reload_schema_for_consistency?: boolean;

  /**
   * End version of delta lake snapshot to read. Value -1 means to read latest version (value 0 is a valid snapshot version).
   * @since 26.1
   */
  delta_lake_snapshot_end_version?: bigint;

  /**
   * Start version of delta lake snapshot to read. Value -1 means to read latest version (value 0 is a valid snapshot version).
   * @since 26.1
   */
  delta_lake_snapshot_start_version?: bigint;

  /**
   * Version of delta lake snapshot to read. Value -1 means to read latest version (value 0 is a valid snapshot version).
   * @since 25.9
   */
  delta_lake_snapshot_version?: bigint;

  /**
   * Enables throwing an exception if there was an error when analyzing scan predicate in delta-kernel.
   * @since 25.9
   */
  delta_lake_throw_on_engine_predicate_error?: boolean;

  /**
   * If true, include only column names and types into result of DESCRIBE query
   */
  describe_compact_output?: boolean;

  /**
   * Enables describing subcolumns for a [DESCRIBE](/reference/statements/describe-table) query. For example, members of a [Tuple](/reference/data-types/tuple) or subcolumns of a [Map](/reference/data-types/map#reading-subcolumns-of-map), [Nullable](/reference/data-types/nullable#finding-null) or an [Array](/reference/data-types/array#array-size) data type. Possible values: - 0 — Subcolumns are not included in `DESCRIBE` queries. - 1 — Subcolumns are included in `DESCRIBE` queries. **Example** See an example for the [DESCRIBE](/reference/statements/describe-table) statement.
   */
  describe_include_subcolumns?: boolean;

  /**
   * If true, virtual columns of table will be included into result of DESCRIBE query
   */
  describe_include_virtual_columns?: boolean;

  /**
   * Which dialect will be used to parse query. Supported values: - `clickhouse` (default) — standard ClickHouse SQL. - `kusto` — Kusto Query Language. Requires the beta setting `allow_experimental_kusto_dialect`. - `prql` — PRQL. Requires the experimental setting `allow_experimental_prql_dialect`. - `polyglot` — transpiles SQL from other dialects (MySQL, PostgreSQL, etc.) into ClickHouse SQL. Requires the experimental setting `allow_experimental_polyglot_dialect`. - `promql` — PromQL (Prometheus Query Language) evaluated over a TimeSeries table, configured by the `promql_database`, `promql_table`, and `promql_evaluation_time` settings. - `clickhouse_json` — instead of SQL text, the query is interpreted as a JSON AST (the output of `parseQueryToJSON`). The `SET` query is still recognized in plain form so that the dialect can be switched back. Requires the experimental setting `enable_json_ast_dialect`. - `logsql` — LogsQL, the log query language of VictoriaLogs, translated into `SELECT` queries over the logs table configured by the `logsql_database` and `logsql_table` settings. Requires the experimental setting `enable_logsql_dialect`. - `trino` — Trino SQL: translates Trino syntax (`ARRAY[...]`, `TRY_CAST`, `UNNEST`, ...) and maps Trino function names to their ClickHouse equivalents. Requires the beta setting `enable_trino_dialect`.
   */
  dialect?:
    | "clickhouse"
    | "kusto"
    | "prql"
    | "promql"
    | "polyglot"
    | "clickhouse_json"
    | "logsql"
    | "trino";

  /**
   * Controls loading of a dictionary when specified in the `SETTINGS` clause of `CREATE DICTIONARY`: `1` defers loading until first use, `0` loads the dictionary at creation, `'auto'` follows the server setting `dictionaries_lazy_load`. Has no effect when set on a session or query level.
   * @since 26.8
   */
  dictionary_lazy_load?: string;

  /**
   * Execute a pipeline for reading dictionary source in several threads. It's supported only by dictionaries with local CLICKHOUSE source.
   * @since 26.2
   */
  dictionary_use_async_executor?: boolean;

  /**
   * Validate primary key type for dictionaries. By default id type for simple layouts will be implicitly converted to UInt64.
   */
  dictionary_validate_primary_key_type?: boolean;

  /**
   * If enabled, the server skips sending query result rows to the client. The query is still executed and logged fully on the server, and the client still receives the remaining packets. Used for shadow traffic, benchmarks, and fuzzing. Has no effect for secondary queries. Affects only the native TCP protocol.
   * @since 26.8
   */
  discard_query_data?: boolean;

  /**
   * Sets what happens when the amount of data exceeds one of the limits. Possible values: - `throw`: throw an exception (default). - `break`: stop executing the query and return the partial result, as if the source data ran out.
   */
  distinct_overflow_mode?: "throw" | "break";

  /**
   * Is the memory-saving mode of distributed aggregation enabled.
   */
  distributed_aggregation_memory_efficient?: boolean;

  /**
   * Enables/disables inserted data sending in batches. When batch sending is enabled, the [Distributed](/reference/engines/table-engines/special/distributed) table engine tries to send multiple files of inserted data in one operation instead of sending them separately. Batch sending improves cluster performance by better-utilizing server and network resources. Possible values: - 1 — Enabled. - 0 — Disabled.
   */
  distributed_background_insert_batch?: boolean;

  /**
   * Maximum interval for the [Distributed](/reference/engines/table-engines/special/distributed) table engine to send data. Limits exponential growth of the interval set in the [distributed_background_insert_sleep_time_ms](#distributed_background_insert_sleep_time_ms) setting. Possible values: - A positive integer number of milliseconds.
   */
  distributed_background_insert_max_sleep_time_ms?: number;

  /**
   * Base interval for the [Distributed](/reference/engines/table-engines/special/distributed) table engine to send data. The actual interval grows exponentially in the event of errors. Possible values: - A positive integer number of milliseconds.
   */
  distributed_background_insert_sleep_time_ms?: number;

  /**
   * Enables/disables splitting batches on failures. Sometimes sending particular batch to the remote shard may fail, because of some complex pipeline after (i.e. `MATERIALIZED VIEW` with `GROUP BY`) due to `Memory limit exceeded` or similar errors. In this case, retrying will not help (and this will stuck distributed sends for the table) but sending files from that batch one by one may succeed INSERT. So installing this setting to `1` will disable batching for such batches (i.e. temporary disables `distributed_background_insert_batch` for failed batches). Possible values: - 1 — Enabled. - 0 — Disabled. <Note> This setting also affects broken batches (that may appears because of abnormal server (machine) termination and no `fsync_after_insert`/`fsync_directories` for [Distributed](/reference/engines/table-engines/special/distributed) table engine). </Note> <Note> You should not rely on automatic batch splitting, since this may hurt performance. </Note>
   */
  distributed_background_insert_split_batch_on_failure?: boolean;

  /**
   * Timeout for insert query into distributed. Setting is used only with insert_distributed_sync enabled. Zero value means no timeout.
   */
  distributed_background_insert_timeout?: bigint;

  /**
   * Only has an effect in ClickHouse Cloud. A setting for testing purposes, do not change it
   * @since 25.8
   */
  distributed_cache_alignment?: bigint;

  /**
   * Only has an effect in ClickHouse Cloud. Allow to bypass distributed cache connection pool
   */
  distributed_cache_bypass_connection_pool?: boolean;

  /**
   * Only has an effect in ClickHouse Cloud. A setting used only for CI tests - overrides the registry-configured distributed cache client id for this query's requests when non-empty. Lets tests spread data across a bounded set of client ids while keeping the same data on the same client id. It requires `ci_mode` to be enabled in the distributed cache client config: when it is not (the default, as in production), a query that routes a read or write through the distributed cache fails with `SUPPORT_IS_DISABLED` instead of silently falling back to the configured client id. Queries that never reach the distributed cache are unaffected, so the value is ignored there.
   * @since 26.10
   */
  distributed_cache_client_id?: string;

  /**
   * Only has an effect in ClickHouse Cloud. Maximum backoff milliseconds for distributed cache connection creation.
   * @since 25.9
   */
  distributed_cache_connect_backoff_max_ms?: bigint;

  /**
   * Only has an effect in ClickHouse Cloud. Minimum backoff milliseconds for distributed cache connection creation.
   * @since 25.9
   */
  distributed_cache_connect_backoff_min_ms?: bigint;

  /**
   * Only has an effect in ClickHouse Cloud. Number of tries to connect to distributed cache if unsuccessful
   */
  distributed_cache_connect_max_tries?: bigint;

  /**
   * Only has an effect in ClickHouse Cloud. Connection timeout when connecting to distributed cache server.
   * @since 25.11
   */
  distributed_cache_connect_timeout_ms?: bigint;

  /**
   * Only has an effect in ClickHouse Cloud. A period of credentials refresh.
   * @since 25.8
   */
  distributed_cache_credentials_refresh_period_seconds?: bigint;

  /**
   * Only has an effect in ClickHouse Cloud. A window for sending ACK for DataPacket sequence in a single distributed cache read request
   */
  distributed_cache_data_packet_ack_window?: bigint;

  /**
   * Only has an effect in ClickHouse Cloud. Discard connection if some data is unread.
   * @since 24.12
   */
  distributed_cache_discard_connection_if_unread_data?: boolean;

  /**
   * Only has an effect in ClickHouse Cloud. Fetch metrics only from current availability zone in system.distributed_cache_metrics, system.distributed_cache_events
   */
  distributed_cache_fetch_metrics_only_from_current_az?: boolean;

  /**
   * Only has an effect in ClickHouse Cloud. A setting used only for CI tests - filesystem cache name to use on distributed cache.
   * @since 26.2
   */
  distributed_cache_file_cache_name?: string;

  /**
   * Only has an effect in ClickHouse Cloud. Mode for writing to system.distributed_cache_log
   */
  distributed_cache_log_mode?: "nothing" | "on_error" | "all";

  /**
   * Only has an effect in ClickHouse Cloud. A maximum number of unacknowledged in-flight packets in a single distributed cache read request
   */
  distributed_cache_max_unacked_inflight_packets?: bigint;

  /**
   * Only has an effect in ClickHouse Cloud. Minimum number of bytes to do seek in distributed cache.
   * @since 25.2
   */
  distributed_cache_min_bytes_for_seek?: bigint;

  /**
   * Only has an effect in ClickHouse Cloud. On a seek away from the current position of an open distributed cache stream, if the estimated number of in-flight bytes that would have to be discarded to keep reusing the connection (via the read range id mechanism) exceeds this value, drop the connection and open a new one instead. This avoids draining a large amount of unused data when seeks are frequent. 0 disables this and always reuses the connection.
   * @since 26.9
   */
  distributed_cache_min_inflight_bytes_to_discard_connection_on_seek?: bigint;

  /**
   * Only has an effect in ClickHouse Cloud. Identifies behaviour of distributed cache connection on pool limit reached
   */
  distributed_cache_pool_behaviour_on_limit?: "wait" | "allocate_bypassing_pool";

  /**
   * Only has an effect in ClickHouse Cloud. Same as filesystem_cache_prefer_bigger_buffer_size, but for distributed cache.
   * @since 25.11
   */
  distributed_cache_prefer_bigger_buffer_size?: boolean;

  /**
   * Only has an effect in ClickHouse Cloud. Allow to read only from current availability zone. If disabled, will read from all cache servers in all availability zones.
   * @since 25.6
   */
  distributed_cache_read_only_from_current_az?: boolean;

  /**
   * Only has an effect in ClickHouse Cloud. Number of tries to do distributed cache read request if unsuccessful
   * @since 25.5
   */
  distributed_cache_read_request_max_tries?: bigint;

  /**
   * Only has an effect in ClickHouse Cloud. Wait time in milliseconds to receive data for request from distributed cache
   */
  distributed_cache_receive_response_wait_milliseconds?: bigint;

  /**
   * Only has an effect in ClickHouse Cloud. Wait time in milliseconds to receive any kind of response from distributed cache Cloud default value: `20000`.
   */
  distributed_cache_receive_timeout_milliseconds?: bigint;

  /**
   * Only has an effect in ClickHouse Cloud. Timeout for receiving data from distributed cache server, in milliseconds. If no bytes were received in this interval, the exception is thrown.
   * @since 25.11
   */
  distributed_cache_receive_timeout_ms?: bigint;

  /**
   * Only has an effect in ClickHouse Cloud. Show the `certificate` and `signature` columns in the `system.distributed_cache_registry` table. By default these columns are empty to keep the output compact; enable this setting to inspect them.
   * @since 26.7
   */
  distributed_cache_registry_show_certificate_and_signature?: boolean;

  /**
   * Only has an effect in ClickHouse Cloud. Timeout for sending data to istributed cache server, in milliseconds. If a client needs to send some data but is not able to send any bytes in this interval, the exception is thrown.
   * @since 25.11
   */
  distributed_cache_send_timeout_ms?: bigint;

  /**
   * Only has an effect in ClickHouse Cloud. The time in milliseconds the connection to distributed cache server needs to remain idle before TCP starts sending keepalive probes.
   * @since 25.11
   */
  distributed_cache_tcp_keep_alive_timeout_ms?: bigint;

  /**
   * Only has an effect in ClickHouse Cloud. Rethrow exception happened during communication with distributed cache or exception received from distributed cache. Otherwise fallback to skipping distributed cache on error
   */
  distributed_cache_throw_on_error?: boolean;

  /**
   * Only has an effect in ClickHouse Cloud. Use clients cache for read requests.
   * @since 26.1
   */
  distributed_cache_use_clients_cache_for_read?: boolean;

  /**
   * Only has an effect in ClickHouse Cloud. Wait time in milliseconds to receive connection from connection pool if distributed_cache_pool_behaviour_on_limit is wait
   */
  distributed_cache_wait_connection_from_pool_milliseconds?: bigint;

  /**
   * Only has an effect in ClickHouse Cloud. Number of tries to do distributed cache write request if unsuccessful
   * @since 26.5
   */
  distributed_cache_write_request_max_tries?: bigint;

  /**
   * The maximum number of simultaneous connections with remote servers for distributed processing of all queries to a single Distributed table. We recommend setting a value no less than the number of servers in the cluster.
   */
  distributed_connections_pool_size?: bigint;

  /**
   * Compatibility version of distributed DDL (ON CLUSTER) queries Cloud default value: `6`.
   */
  distributed_ddl_entry_format_version?: bigint;

  /**
   * Sets format of distributed DDL query result. Possible values: - `throw` — Returns result set with query execution status for all hosts where query is finished. If query has failed on some hosts, then it will rethrow the first exception. If query is not finished yet on some hosts and [distributed_ddl_task_timeout](#distributed_ddl_task_timeout) exceeded, then it throws `TIMEOUT_EXCEEDED` exception. - `none` — Is similar to throw, but distributed DDL query returns no result set. - `null_status_on_timeout` — Returns `NULL` as execution status in some rows of result set instead of throwing `TIMEOUT_EXCEEDED` if query is not finished on the corresponding hosts. - `never_throw` — Do not throw `TIMEOUT_EXCEEDED` and do not rethrow exceptions if query has failed on some hosts. - `none_only_active` - similar to `none`, but doesn't wait for inactive replicas of the `Replicated` database. Note: with this mode it's impossible to figure out that the query was not executed on some replica and will be executed in background. - `null_status_on_timeout_only_active` — similar to `null_status_on_timeout`, but doesn't wait for inactive replicas of the `Replicated` database - `throw_only_active` — similar to `throw`, but doesn't wait for inactive replicas of the `Replicated` database Cloud default value: `none_only_active`.
   */
  distributed_ddl_output_mode?:
    | "none"
    | "throw"
    | "null_status_on_timeout"
    | "throw_only_active"
    | "null_status_on_timeout_only_active"
    | "none_only_active"
    | "never_throw";

  /**
   * Sets timeout for DDL query responses from all hosts in cluster. If a DDL request has not been performed on all hosts, a response will contain a timeout error and a request will be executed in an async mode. Negative value means infinite. Possible values: - Positive integer. - 0 — Async mode. - Negative integer — infinite timeout.
   */
  distributed_ddl_task_timeout?: bigint;

  /**
   * Enables or disables synchronous data insertion into a [Distributed](/reference/engines/table-engines/special/distributed) table. By default, when inserting data into a `Distributed` table, the ClickHouse server sends data to cluster nodes in background mode. When `distributed_foreground_insert=1`, the data is processed synchronously, and the `INSERT` operation succeeds only after all the data is saved on all shards (at least one replica for each shard if `internal_replication` is true). Possible values: - `0` — Data is inserted in background mode. - `1` — Data is inserted in synchronous mode. Cloud default value: `1`. **See Also** - [Distributed Table Engine](/reference/engines/table-engines/special/distributed) - [Managing Distributed Tables](/reference/statements/system#managing-distributed-tables)
   */
  distributed_foreground_insert?: boolean;

  /**
   * Do not merge aggregation states from different servers for distributed query processing, you can use this in case it is for certain that there are different keys on different shards Possible values: - `0` — Disabled (final query processing is done on the initiator node). - `1` - Do not merge aggregation states from different servers for distributed query processing (query completely processed on the shard, initiator only proxy the data), can be used in case it is for certain that there are different keys on different shards. - `2` - Same as `1` but applies `ORDER BY` and `LIMIT` (it is not possible when the query processed completely on the remote node, like for `distributed_group_by_no_merge=1`) on the initiator (can be used for queries with `ORDER BY` and/or `LIMIT`). **Example** ```sql SELECT * FROM remote('127.0.0.{2,3}', system.one) GROUP BY dummy LIMIT 1 SETTINGS distributed_group_by_no_merge = 1 FORMAT PrettyCompactMonoBlock ┌─dummy─┐ │ 0 │ │ 0 │ └───────┘ ``` ```sql SELECT * FROM remote('127.0.0.{2,3}', system.one) GROUP BY dummy LIMIT 1 SETTINGS distributed_group_by_no_merge = 2 FORMAT PrettyCompactMonoBlock ┌─dummy─┐ │ 0 │ └───────┘ ```
   */
  distributed_group_by_no_merge?: bigint;

  /**
   * Index analysis will be distributed across replicas. Beneficial for shared storage and huge amount of data in cluster. Uses replicas from cluster_for_parallel_replicas. **See also** - [distributed_index_analysis_for_non_shared_merge_tree](#distributed_index_analysis_for_non_shared_merge_tree) - [distributed_index_analysis_min_parts_to_activate](/reference/settings/merge-tree-settings/distributed-index#distributed_index_analysis_min_parts_to_activate) - [distributed_index_analysis_min_indexes_bytes_to_activate](/reference/settings/merge-tree-settings/distributed-index#distributed_index_analysis_min_indexes_bytes_to_activate)
   * @since 26.2
   */
  distributed_index_analysis?: boolean;

  /**
   * Enable distributed index analysis even for non SharedMergeTree (cloud only engine).
   * @since 26.2
   */
  distributed_index_analysis_for_non_shared_merge_tree?: boolean;

  /**
   * If enabled, distributed index analysis runs only on the coordinator. This prevents O(N^2) spawned queries when the predicate contains subqueries (e.g., `IN (SELECT ...)`), because each follower replica would otherwise independently trigger its own distributed index analysis, but makes distributed index analysis less efficient if large tables are used in the subqueries.
   * @since 26.5
   */
  distributed_index_analysis_only_on_coordinator?: boolean;

  /**
   * Enables skipping read-only replicas for INSERT queries into Distributed. Possible values: - 0 — INSERT was as usual, if it will go to read-only replica it will fail - 1 — Initiator will skip read-only replicas before sending data to shards.
   */
  distributed_insert_skip_read_only_replicas?: boolean;

  /**
   * Default number of tasks for parallel reading in distributed query. Tasks are spread across between replicas. Used by the rule-based distributed planner. The cost-based optimizer chooses the read fan-out by estimated cost and does not use this setting.
   * @since 25.7
   */
  distributed_plan_default_reader_bucket_count?: bigint;

  /**
   * Default number of buckets for distributed shuffle-hash-join. Used by the rule-based distributed planner. The cost-based optimizer chooses the fan-out by estimated cost and does not use this setting.
   * @since 25.7
   */
  distributed_plan_default_shuffle_join_bucket_count?: bigint;

  /**
   * Run all tasks of a distributed query plan locally. Useful for testing and debugging.
   * @since 25.7
   */
  distributed_plan_execute_locally?: boolean;

  /**
   * When a query plan contains a step that does not support distributed execution, log the reason and execute the query on the initiator instead of throwing an exception. Disable to get an exception instead. Only takes effect when `make_distributed_plan` (private preview) is enabled.
   * @since 26.10
   */
  distributed_plan_fallback_to_local_execution?: boolean;

  /**
   * Force specified kind of Exchange operators between distributed query stages. Possible values: - '' - do not force any kind of Exchange operators, let the optimizer choose, - 'Persisted' - use temporary files in object storage, - 'Streaming' - stream exchange data over network.
   * @since 25.7
   */
  distributed_plan_force_exchange_kind?: string;

  /**
   * Use Shuffle aggregation strategy instead of PartialAggregation + Merge in distributed query plan. Ignored where the Shuffle strategy cannot produce a correct result, for example for `GROUPING SETS` or when the aggregation must produce results in bucket order.
   * @since 25.8
   */
  distributed_plan_force_shuffle_aggregation?: boolean;

  /**
   * With `make_distributed_plan`, send join runtime filters built in one stage to the stages that read the probe side, so those stages filter rows before sending them. If a filter does not arrive, rows pass unfiltered. Requires `enable_join_runtime_filters`.
   * @since 26.11
   */
  distributed_plan_join_runtime_filters?: boolean;

  /**
   * When `send_logs_level` forwards stateless-worker task logs to the coordinator, each worker task buffers at most this many log lines between status polls. Lines beyond the bound are dropped and their count is reported to the client. `0` means unbounded (never drops, but a stalled status poll can grow the buffer without limit).
   * @since 26.11
   */
  distributed_plan_max_buffered_log_rows?: bigint;

  /**
   * Maximum rows to use broadcast join instead of shuffle join in distributed query plan. A heuristic for the rule-based distributed planner. When the cost-based optimizer is enabled, the broadcast-vs-shuffle choice is made by estimated cost and this setting has no effect.
   * @since 25.8
   */
  distributed_plan_max_rows_to_broadcast?: bigint;

  /**
   * Removes unnecessary exchanges in distributed query plan. Disable it for debugging.
   * @since 25.7
   */
  distributed_plan_optimize_exchanges?: boolean;

  /**
   * Serialize the distributed query plan for execution at replicas.
   * @since 26.5
   */
  distributed_plan_prefer_replicas_over_workers?: boolean;

  /**
   * Allow the read-in-order optimization for `ORDER BY` in a distributed query plan, so a sorted read of the table's sorting key can skip the sort and stop early instead of scanning and sorting. Off by default: the rewrite that distributes a sort assumes the sort it wraps does not depend on its input already being ordered, and a sort that does can be fed rows through an exchange that does not preserve order. Only shapes where no exchange survives between the read and the sort are safe today.
   * @since 26.10
   */
  distributed_plan_read_in_order?: boolean;

  /**
   * How many stateless workers will be used to execute this query. Zero disables stateless-worker leasing for distributed plans.
   * @since 26.7
   */
  distributed_plan_workers_num?: bigint;

  /**
   * Total wall-clock time, in milliseconds, a query may spend provisioning stateless workers before execution: leasing them from the discovery service and verifying they are reachable. The query blocks up to this budget for the leased workers to become ready; when it elapses the query proceeds with the workers verified so far, or fails if none became available. Zero waits only for the initial lease-and-verify pass (no retries).
   * @since 26.10
   */
  distributed_plan_workers_provisioning_timeout_ms?: bigint;

  /**
   * Changes the behaviour of [distributed subqueries](/reference/statements/in). ClickHouse applies this setting when the query contains the product of distributed tables, i.e. when the query for a distributed table contains a non-GLOBAL subquery for the distributed table. Restrictions: - Only applied for IN and JOIN subqueries. - Only if the FROM section uses a distributed table containing more than one shard. - If the subquery concerns a distributed table containing more than one shard. - Not used for a table-valued [remote](/reference/functions/table-functions/remote) function. Possible values: - `deny` — Default value. Prohibits using these types of subqueries (returns the "Double-distributed in/JOIN subqueries is denied" exception). - `local` — Replaces the database and table in the subquery with local ones for the destination server (shard), leaving the normal `IN`/`JOIN.` - `global` — Replaces the `IN`/`JOIN` query with `GLOBAL IN`/`GLOBAL JOIN.` - `allow` — Allows the use of these types of subqueries.
   */
  distributed_product_mode?: "deny" | "local" | "global" | "allow";

  /**
   * Enables or disables [LIMIT](#limit) applying on each shard separately. This will allow to avoid: - Sending extra rows over network; - Processing rows behind the limit on the initiator. Starting from 21.9 version you cannot get inaccurate results anymore, since `distributed_push_down_limit` changes query execution only if at least one of the conditions met: - [distributed_group_by_no_merge](#distributed_group_by_no_merge) > 0. - Query **does not have** `GROUP BY`/`DISTINCT`/`LIMIT BY`, but it has `ORDER BY`/`LIMIT`. - Query **has** `GROUP BY`/`DISTINCT`/`LIMIT BY` with `ORDER BY`/`LIMIT` and: - [optimize_skip_unused_shards](#optimize_skip_unused_shards) is enabled. - [optimize_distributed_group_by_sharding_key](#optimize_distributed_group_by_sharding_key) is enabled. Possible values: - 0 — Disabled. - 1 — Enabled. See also: - [distributed_group_by_no_merge](#distributed_group_by_no_merge) - [optimize_skip_unused_shards](#optimize_skip_unused_shards) - [optimize_distributed_group_by_sharding_key](#optimize_distributed_group_by_sharding_key)
   */
  distributed_push_down_limit?: bigint;

  /**
   * - Type: unsigned int - Default value: 1000 The error count of each replica is capped at this value, preventing a single replica from accumulating too many errors. See also: - [load_balancing](#load_balancing-round_robin) - [Table engine Distributed](/reference/engines/table-engines/special/distributed) - [distributed_replica_error_half_life](#distributed_replica_error_half_life) - [distributed_replica_max_ignored_errors](#distributed_replica_max_ignored_errors)
   */
  distributed_replica_error_cap?: bigint;

  /**
   * - Type: seconds - Default value: 60 seconds Controls how fast errors in distributed tables are zeroed. If a replica is unavailable for some time, accumulates 5 errors, and distributed_replica_error_half_life is set to 1 second, then the replica is considered normal 3 seconds after the last error. See also: - [load_balancing](#load_balancing-round_robin) - [Table engine Distributed](/reference/engines/table-engines/special/distributed) - [distributed_replica_error_cap](#distributed_replica_error_cap) - [distributed_replica_max_ignored_errors](#distributed_replica_max_ignored_errors)
   */
  distributed_replica_error_half_life?: number;

  /**
   * - Type: unsigned int - Default value: 0 The number of errors that will be ignored while choosing replicas (according to `load_balancing` algorithm). See also: - [load_balancing](#load_balancing-round_robin) - [Table engine Distributed](/reference/engines/table-engines/special/distributed) - [distributed_replica_error_cap](#distributed_replica_error_cap) - [distributed_replica_error_half_life](#distributed_replica_error_half_life)
   */
  distributed_replica_max_ignored_errors?: bigint;

  /**
   * Improve FINAL queries by avoiding merges across different partitions. When enabled, during SELECT FINAL queries, parts from different partitions will not be merged together. Instead, merging will only occur within each partition separately. This can significantly improve query performance when working with partitioned tables.
   */
  do_not_merge_across_partitions_select_final?: boolean;

  /**
   * Allow using `from_env` substitutions in the dynamic disk configuration (i.e. in the `disk()` function arguments). Disabled by default to prevent users from reading arbitrary environment variables when defining table storage.
   * @since 26.6
   */
  dynamic_disk_allow_from_env?: boolean;

  /**
   * Allow using `from_zk` substitutions in the dynamic disk configuration (i.e. in the `disk()` function arguments). Disabled by default.
   * @since 26.6
   */
  dynamic_disk_allow_from_zk?: boolean;

  /**
   * Allow using `include` in the dynamic disk configuration (i.e. in the `disk()` function arguments). Disabled by default.
   * @since 26.6
   */
  dynamic_disk_allow_include?: boolean;

  /**
   * When applying a function to a [Dynamic](/reference/data-types/dynamic) column using the default implementation, controls what happens for rows whose actual type is incompatible with the function: - `true` (default) — throw an exception. - `false` — return `NULL` for those rows instead.
   * @since 26.5
   */
  dynamic_throw_on_type_mismatch?: boolean;

  /**
   * Return empty result when aggregating by constant keys on empty set.
   */
  empty_result_for_aggregation_by_constant_keys_on_empty_set?: boolean;

  /**
   * Return empty result when aggregating without keys on empty set.
   */
  empty_result_for_aggregation_by_empty_set?: boolean;

  /**
   * Enables the adaptive `GROUP BY` algorithm: every thread aggregates into its local hash table until it reaches `adaptive_aggregator_freeze_threshold` keys (or `adaptive_aggregator_freeze_threshold_bytes` of memory), then the table freezes, so that rows of already-seen (frequent) keys keep updating it in place, while new (rare) keys are routed by their hash into per-bucket backlogs and aggregated exactly once, inside the bucket-parallel merge. Frequent keys stay in small cache-resident tables, and rare keys are stored and processed once instead of once per thread. The external aggregation settings (`max_bytes_before_external_group_by`, `max_bytes_ratio_before_external_group_by`) are honored: past the threshold the backlogs are drained early into the shared table, and if that is not enough to get back under it, the shared table spills to disk through the ordinary external aggregation.
   * @since 26.9
   */
  enable_adaptive_aggregator?: boolean;

  /**
   * Adaptively spill eligible aggregation, sorting, `DISTINCT`, and hash-join processors to external storage under query memory pressure. Supported hash joins include `grace_hash` and the adaptive `hash` / `parallel_hash` path.
   * @since 25.3
   */
  enable_adaptive_memory_spill_scheduler?: boolean;

  /**
   * Enable `DISTINCT` in `IN` subqueries. This is a trade-off setting: enabling it can greatly reduce the size of temporary tables transferred for distributed IN subqueries and significantly speed up data transfer between shards, by ensuring only unique values are sent. However, enabling this setting adds extra merging effort on each node, as deduplication (DISTINCT) must be performed. Use this setting when network transfer is a bottleneck and the additional merging cost is acceptable.
   * @since 25.9
   */
  enable_add_distinct_to_in_subqueries?: boolean;

  /**
   * Enables the `ALP` compression codec.
   * @since 26.9
   */
  enable_alp_codec?: boolean;

  /**
   * If set, ClickHouse will automatically enable this optimization when the partition key expression is deterministic and all columns used in the partition key expression are included in the primary key. This automatic derivation ensures that rows with the same primary key values will always belong to the same partition, making it safe to avoid cross-partition merges. Floating-point key columns are excluded from this derivation. The `FINAL` comparator is coarser than value identity for `Float32`, `Float64` and `BFloat16`: `-0.0` compares equal to `0.0`, and every `NaN` bit pattern compares equal to every other. A partition expression can tell exactly those values apart, so rows the comparator treats as one key can land in different partitions, and skipping the cross-partition merge would return all of them. The exclusion also applies when a float is nested inside a key column, for example `Tuple(Float64, UInt8)` or `Array(Float64)`.
   * @since 26.3
   */
  enable_automatic_decision_for_merging_across_partitions_for_final?: boolean;

  /**
   * Write information about blob storage operations to system.blob_storage_log table
   */
  enable_blob_storage_log?: boolean;

  /**
   * Write information about blob storage read operations to system.blob_storage_log table. Requires `enable_blob_storage_log` to be enabled as well.
   * @since 26.6
   */
  enable_blob_storage_log_for_read_operations?: boolean;

  /**
   * Enable the Cascades cost-based optimizer for distributed query plans. Takes effect only together with `make_distributed_plan = 1`: the setting alone does not change single-node query planning.
   * @since 26.9
   */
  enable_cascades_optimizer?: boolean;

  /**
   * Enable query optimization where we analyze function and subqueries results and rewrite query if there are constants there
   */
  enable_early_constant_folding?: boolean;

  /**
   * Enables or disables returning results of type `Date32` with extended range (compared to type `Date`) or `DateTime64` with extended range (compared to type `DateTime`). Possible values: - `0` — Functions return `Date` or `DateTime` for all types of arguments. - `1` — Functions return `Date32` or `DateTime64` for `Date32` or `DateTime64` arguments and `Date` or `DateTime` otherwise. The table below shows the behavior of this setting for various date-time functions. | Function | `enable_extended_results_for_datetime_functions = 0` | `enable_extended_results_for_datetime_functions = 1` | |----------|---------------------------------------------------|---------------------------------------------------| | `toStartOfYear` | Returns `Date` or `DateTime` | Returns `Date`/`DateTime` for `Date`/`DateTime` input<br/>Returns `Date32`/`DateTime64` for `Date32`/`DateTime64` input | | `toStartOfISOYear` | Returns `Date` or `DateTime` | Returns `Date`/`DateTime` for `Date`/`DateTime` input<br/>Returns `Date32`/`DateTime64` for `Date32`/`DateTime64` input | | `toStartOfQuarter` | Returns `Date` or `DateTime` | Returns `Date`/`DateTime` for `Date`/`DateTime` input<br/>Returns `Date32`/`DateTime64` for `Date32`/`DateTime64` input | | `toStartOfMonth` | Returns `Date` or `DateTime` | Returns `Date`/`DateTime` for `Date`/`DateTime` input<br/>Returns `Date32`/`DateTime64` for `Date32`/`DateTime64` input | | `toStartOfWeek` | Returns `Date` or `DateTime` | Returns `Date`/`DateTime` for `Date`/`DateTime` input<br/>Returns `Date32`/`DateTime64` for `Date32`/`DateTime64` input | | `toLastDayOfWeek` | Returns `Date` or `DateTime` | Returns `Date`/`DateTime` for `Date`/`DateTime` input<br/>Returns `Date32`/`DateTime64` for `Date32`/`DateTime64` input | | `toLastDayOfMonth` | Returns `Date` or `DateTime` | Returns `Date`/`DateTime` for `Date`/`DateTime` input<br/>Returns `Date32`/`DateTime64` for `Date32`/`DateTime64` input | | `toMonday` | Returns `Date` or `DateTime` | Returns `Date`/`DateTime` for `Date`/`DateTime` input<br/>Returns `Date32`/`DateTime64` for `Date32`/`DateTime64` input | | `toStartOfDay` | Returns `DateTime`<br/>*Note: Wrong results for values outside 1970-2149 range* | Returns `DateTime` for `Date`/`DateTime` input<br/>Returns `DateTime64` for `Date32`/`DateTime64` input | | `toStartOfHour` | Returns `DateTime`<br/>*Note: Wrong results for values outside 1970-2149 range* | Returns `DateTime` for `Date`/`DateTime` input<br/>Returns `DateTime64` for `Date32`/`DateTime64` input | | `toStartOfFifteenMinutes` | Returns `DateTime`<br/>*Note: Wrong results for values outside 1970-2149 range* | Returns `DateTime` for `Date`/`DateTime` input<br/>Returns `DateTime64` for `Date32`/`DateTime64` input | | `toStartOfTenMinutes` | Returns `DateTime`<br/>*Note: Wrong results for values outside 1970-2149 range* | Returns `DateTime` for `Date`/`DateTime` input<br/>Returns `DateTime64` for `Date32`/`DateTime64` input | | `toStartOfFiveMinutes` | Returns `DateTime`<br/>*Note: Wrong results for values outside 1970-2149 range* | Returns `DateTime` for `Date`/`DateTime` input<br/>Returns `DateTime64` for `Date32`/`DateTime64` input | | `toStartOfMinute` | Returns `DateTime`<br/>*Note: Wrong results for values outside 1970-2149 range* | Returns `DateTime` for `Date`/`DateTime` input<br/>Returns `DateTime64` for `Date32`/`DateTime64` input | | `timeSlot` | Returns `DateTime`<br/>*Note: Wrong results for values outside 1970-2149 range* | Returns `DateTime` for `Date`/`DateTime` input<br/>Returns `DateTime64` for `Date32`/`DateTime64` input |
   */
  enable_extended_results_for_datetime_functions?: boolean;

  /**
   * Use cache for remote filesystem. This setting does not turn on/off cache for disks (must be done via disk config), but allows to bypass cache for some queries if intended
   */
  enable_filesystem_cache?: boolean;

  /**
   * Allows to record the filesystem caching log for each query
   */
  enable_filesystem_cache_log?: boolean;

  /**
   * Enables or disables `write-through` cache. If set to `false`, the `write-through` cache is disabled for write operations. If set to `true`, `write-through` cache is enabled as long as `cache_on_write_operations` is turned on in the server config's cache disk configuration section. See ["Using local cache"](/concepts/features/configuration/server-config/storing-data#using-local-cache) for more details. Cloud default value: `1`.
   */
  enable_filesystem_cache_on_write_operations?: boolean;

  /**
   * Log to system.filesystem prefetch_log during query. Should be used only for testing or debugging, not recommended to be turned on by default
   */
  enable_filesystem_read_prefetches_log?: boolean;

  /**
   * If set to true, allow using the text index.
   * @since 26.1
   */
  enable_full_text_index?: boolean;

  /**
   * Enable early short-circuit constant folding for `and` and `or` during query analysis. When enabled, eligible dead scalar-subquery branches are analyzed to preserve their types and validate query semantics, but they are not executed. The optimization falls back to normal analysis when scalar cardinality or runtime values are required.
   * @since 26.9
   */
  enable_function_early_short_circuit?: boolean;

  /**
   * Enable functions for funnel analysis.
   * @since 26.10
   */
  enable_funnel_functions?: boolean;

  /**
   * Propagate WITH statements to UNION queries and all subqueries
   */
  enable_global_with_statement?: boolean;

  /**
   * For [enable_group_by_top_k_optimization](#enable_group_by_top_k_optimization): when the first ranked `GROUP BY` key is a column read from a `MergeTree` table, the aggregation publishes the boundary of its top-K heap to the reading step as soon as the heap holds `LIMIT` keys. The reading step then drops rows whose key lies beyond the boundary before the other columns are read (`PREWHERE`), and skips whole granules that lie beyond it using the primary key or a `minmax` skip index on that column. This applies to `GROUP BY key ORDER BY key LIMIT n` and to `GROUP BY key LIMIT n` without `ORDER BY`, where any `n` groups are a valid answer. It is not applied to a read with `FINAL` or with parallel replicas: `FINAL` must see every version of a row, and the boundary is not carried to the reads on remote replicas. Possible values: - 0 — Disabled. - 1 — Enabled.
   * @since 26.11
   */
  enable_group_by_top_k_dynamic_filtering?: boolean;

  /**
   * Enable TopK filtering optimization during aggregation in `GROUP BY keys ORDER BY <prefix of keys> LIMIT K` queries, and in `GROUP BY keys LIMIT K` queries without `ORDER BY` (any `K` groups are a valid result there, so a sort over all keys is synthesized). When enabled, the aggregator maintains a bounded heap of the top `K` keys seen so far and skips inserting new rows into the hash table when their grouping key cannot make it into the final result. This avoids aggregating rows that would be discarded by the subsequent `ORDER BY ... LIMIT`, and when the heap ranks the full `GROUP BY` key it also prunes evicted groups out of the intermediate hash table, bounding its size by the `LIMIT` instead of the number of distinct keys. When the `ORDER BY` covers only a proper prefix of the `GROUP BY` keys, the ranking cannot identify a full group, so only row skipping applies: the hash table keeps every admitted group and can still grow with the cardinality of the remaining key columns. The optimization is disabled when the requested `LIMIT` is higher than [query_plan_max_limit_for_top_k_optimization](#query_plan_max_limit_for_top_k_optimization) or than the hard cap of `100000`, because the memory and CPU cost of the heap grows with the requested `LIMIT`. The optimization is skipped for query shapes where pruning groups could change the result, including `WITH TOTALS`, `HAVING`, `QUALIFY`, window functions, `ROLLUP`/`CUBE`/`GROUPING SETS`, `LIMIT WITH TIES`, a `COLLATE` on any of the matched `GROUP BY` keys (a `COLLATE` on a later `ORDER BY` column past the full key prefix cannot affect which groups qualify, so it does not disable the optimization), `ORDER BY` on an aggregate or on anything that is not a leading prefix of the `GROUP BY` keys, and when `max_rows_to_group_by` or `exact_rows_before_limit` is set. Possible values: - 0 — Disabled. - 1 — Enabled.
   * @since 26.9
   */
  enable_group_by_top_k_optimization?: boolean;

  /**
   * Enable transforming the payload of a hash join into a row-major layout.
   * @since 26.10
   */
  enable_hash_join_row_store?: boolean;

  /**
   * Enable or disables pread for HDFS files. By default, `hdfsPread` is used. If disabled, `hdfsRead` and `hdfsSeek` will be used to read hdfs files.
   * @since 25.5
   */
  enable_hdfs_pread?: boolean;

  /**
   * Enables or disables data compression in the response to an HTTP request. For more information, read the [HTTP interface description](/concepts/features/interfaces/http). Possible values: - 0 — Disabled. - 1 — Enabled.
   */
  enable_http_compression?: boolean;

  /**
   * Enable the identifier resolution cache in the query analyzer. The cache shares resolved alias nodes to prevent AST explosion when the same alias is referenced multiple times. Set to false to disable caching if incorrect results are suspected.
   * @since 26.7
   */
  enable_identifier_resolve_cache?: boolean;

  /**
   * Enable experimental IP address encryption functions (`ipcryptEncrypt`, `ipcryptDecrypt`, `ipcryptPrefixEncrypt`, `ipcryptPrefixDecrypt`).
   * @since 26.11
   */
  enable_ipcrypt?: boolean;

  /**
   * Output stack trace of a job creator when job results in exception. Disabled by default to avoid performance overhead.
   */
  enable_job_stack_trace?: boolean;

  /**
   * Enable converting the hash table to a flat array for joins when the key is a single integer with a small value range.
   * @since 26.5
   */
  enable_join_fixed_hash_table_conversion?: boolean;

  /**
   * Use hash tables that store the join keys alone, without a reference to a right row, for joins whose result can never contain a value taken from a right row: `LEFT ANTI`, and `LEFT SEMI` when no right column is selected. Such a table has a smaller cell and lets the right blocks be dropped instead of stored.
   * @since 26.10
   */
  enable_join_key_only_hash_tables?: boolean;

  /**
   * Filter left side by set of JOIN keys collected from the right side at runtime.
   * @since 25.11
   */
  enable_join_runtime_filters?: boolean;

  /**
   * Prune granules on the probe side of a JOIN with the runtime filter collected from the build side, see `enable_join_runtime_filters`. Only has an effect if `use_skip_indexes_on_data_read = 1`. Only a join key that is a primary key column of the probe side, or is covered by a `minmax`, `set` or `bloom_filter` skip index, can be pruned. If the runtime filter kept the exact key values, the pruning predicate is an `IN` set of them, otherwise the minimum/maximum key range is used (this has a lower pruning power). Works with parallel replicas (`enable_parallel_replicas = 1`): each replica prunes the granules it reads with the filter it built itself. That filter can be partial - for a `RIGHT` join the build side is the one split among the replicas, so each replica's filter covers only its own share of it - but the result stays correct, because exactly one side of the join is split, every matching pair of rows meets on exactly one replica, and each replica emits a disjoint share of the result. The granule pruning does not happen with a distributed query plan (`make_distributed_plan = 1`). There the setting is a no-op: the query returns the same result and the JOIN runtime filter itself behaves exactly as it does with this setting disabled, only the granule pruning is lost. The granule pruning is also skipped for a probe side read with `FINAL` (the pruning is not implemented for `FINAL` reads, and `optimizeLazyFinal` rebuilds such a read without the descriptors), and for a table with pending data or `ALTER` mutations or patch parts. These cases are a no-op in the same sense.
   * @since 26.8
   */
  enable_join_runtime_filters_index_analysis?: boolean;

  /**
   * Gate the probe-side reading of a hash JOIN on the completion of the build-side runtime filter (see `enable_join_runtime_filters`): nothing is read on the probe side until the filter is complete, and the filter is then used to prune whole mark ranges by the primary key before read tasks are created, in addition to the ordinary row-level filtering. The gating is expressed as an edge of the query pipeline. On a gated read, the read-time index analysis of the same runtime filter (see `enable_join_runtime_filters_index_analysis`) is skipped as redundant. Experimental. Local reads are gated, including single-threaded and in-order reading; reads under FINAL, parallel replicas, or a join sharded by primary key ranges fall back to ungated reading with row-level filtering.
   * @since 26.11
   */
  enable_join_seal_gated_reading?: boolean;

  /**
   * Infer transitive equi-join predicates from existing join conditions. For example, given `A.x = B.x` and `B.x = C.x`, a synthetic `A.x = C.x` predicate is added so the join order optimizer can consider direct (A JOIN C) plans.
   * @since 26.5
   */
  enable_join_transitive_predicates?: boolean;

  /**
   * Enable the `clickhouse_json` value of the `dialect` setting. When `dialect` is set to `clickhouse_json`, queries are interpreted as JSON ASTs (the output of `parseQueryToJSON`) instead of SQL text. The `SET` query is still parsed as plain SQL so that the dialect can be switched back. Example: ```sql SET enable_json_ast_dialect = 1; SET dialect = 'clickhouse_json'; -- Subsequent queries are parsed as JSON ASTs: {"type":"SelectWithUnionQuery", ...} ```
   * @since 26.9
   */
  enable_json_ast_dialect?: boolean;

  /**
   * Enables lazy type hints for the [JSON](/reference/data-types/newjson) type. With this setting enabled, `ALTER TABLE ... MODIFY COLUMN json JSON(path TypeName)` that only adds or changes type hints is a metadata-only operation: the type hints are applied at query time for existing parts and materialized during inserts and background merges instead of rewriting the historical data.
   * @since 26.10
   */
  enable_json_lazy_type_hints?: boolean;

  /**
   * Enables lazy columns replication in `JOIN`, `ARRAY JOIN` and lambda captures of higher-order functions (e.g. `arrayMap`), it allows to avoid unnecessary copy of the same rows multiple times in memory.
   * @since 25.12
   */
  enable_lazy_columns_replication?: boolean;

  /**
   * Enable lightweight DELETE mutations for mergetree tables.
   */
  enable_lightweight_delete?: boolean;

  /**
   * Allow to use lightweight updates.
   * @since 25.9
   */
  enable_lightweight_update?: boolean;

  /**
   * Enable LogsQL - the log query language of VictoriaLogs. Queries in this dialect are translated into SELECT queries over the table specified by the `logsql_table` setting. Usage: ```sql SET enable_logsql_dialect = 1; SET logsql_table = 'logs'; SET dialect = 'logsql'; _time:1h error | stats by (host) count() ``` A complete standalone `SET` query is still parsed as plain SQL so that the dialect can be switched back; a LogsQL query merely starting with the word `set` keeps its meaning. The `logsql_time_column` and `logsql_message_column` settings configure the columns referred to by the `_time` field and by the default (message) field. Unlike VictoriaLogs, which stores every field as a string, the translated queries run over the existing table schema. The key contract deviations that follow from this: - Text filters (words, phrases, prefixes, regexps) expect `String`-backed columns and do not convert numeric columns to text. - Numeric comparison filters compare numeric columns natively (exactly for integer and decimal values, as long as the compared literal fits `Int128` or `Decimal256(38)`; a wider value, e.g. an integer above 1e38 in a `UInt256` field, is compared with `Float64` precision, and so are the integral bucket steps of `stats by (<field>:<step>)`). For `String` columns, only plain numeric text is parsed per row; values in the LogsQL number grammar (e.g. `10KiB`, `1h30m`) are not parsed per row. - The numeric stats functions (`sum`, `avg`, `median`, `quantile`, `stddev`, `rate_sum`) parse the numeric value of every field, skipping the values that are not numbers, like VictoriaLogs. The values are `Float64`, so a numeric column is aggregated with `Float64` precision and not exactly. - The `math` pipe requires numeric operand columns; `String` columns are not coerced. - Query results are returned with the types of the underlying columns, not as strings.
   * @since 26.11
   */
  enable_logsql_dialect?: boolean;

  /**
   * Enable materialized common table expressions (`WITH <name> AS MATERIALIZED (<subquery>)`). When enabled, a CTE declared as `MATERIALIZED` that is referenced more than once is executed once, stored in a temporary table, and all references read from that table. A CTE referenced only once is inlined as an ordinary CTE to avoid the overhead. When disabled, the `MATERIALIZED` keyword is ignored: the CTE is inlined at each reference like an ordinary CTE, and a warning is logged.
   * @since 26.5
   */
  enable_materialized_cte?: boolean;

  /**
   * Allows to use the `MaterializedPostgreSQL` table engine.
   * @since 26.10
   */
  enable_materialized_postgresql_table?: boolean;

  /**
   * Enable memory bound merging strategy for aggregation.
   */
  enable_memory_bound_merging_of_aggregation_results?: boolean;

  /**
   * Move more conditions from WHERE to PREWHERE and do reads from disk and filtering in multiple steps if there are multiple conditions combined with AND
   */
  enable_multiple_prewhere_read_steps?: boolean;

  /**
   * Generate named tuples in function tuple() when all names are unique and can be treated as unquoted identifiers.
   */
  enable_named_columns_in_function_tuple?: boolean;

  /**
   * Allows creation of [Nullable](/reference/data-types/nullable) [Tuple](/reference/data-types/tuple) columns in tables. This setting does not control whether extracted tuple subcolumns can be `Nullable` (for example, from Dynamic, Variant, JSON, or Tuple columns). Use `allow_nullable_tuple_in_extracted_subcolumns` to control whether extracted tuple subcolumns can be `Nullable`.
   * @since 26.10
   */
  enable_nullable_tuple_type?: boolean;

  /**
   * Allow push predicate to final subquery.
   */
  enable_optimize_predicate_expression_to_final_subquery?: boolean;

  /**
   * Enables or disables sorting with `ORDER BY ALL` syntax, see [ORDER BY](/reference/statements/select/order-by). Possible values: - 0 — Disable ORDER BY ALL. - 1 — Enable ORDER BY ALL. **Example** Query: ```sql CREATE TABLE TAB(C1 Int, C2 Int, ALL Int) ENGINE=Memory(); INSERT INTO TAB VALUES (10, 20, 30), (20, 20, 10), (30, 10, 20); SELECT * FROM TAB ORDER BY ALL; -- returns an error that ALL is ambiguous SELECT * FROM TAB ORDER BY ALL SETTINGS enable_order_by_all = 0; ``` Result: ```text ┌─C1─┬─C2─┬─ALL─┐ │ 20 │ 20 │ 10 │ │ 30 │ 10 │ 20 │ │ 10 │ 20 │ 30 │ └────┴────┴─────┘ ```
   */
  enable_order_by_all?: boolean;

  /**
   * Use a hash table keyed by 16-byte packed string references (`PackedStringRef`) for `GROUP BY` with a single non-nullable `String` key. Keys of up to 11 bytes are stored inline in the packed reference; longer keys are referenced in an arena. This is faster for most workloads, but can be slower than the legacy method for `GROUP BY` with very few distinct keys longer than 11 bytes (most noticeably 12..24 bytes), where the legacy hash table keeps keys inline in the cell while the packed one dereferences the arena pointer on every probe. When disabled, the legacy `StringHashTable`-based method (the default before 26.8) is used. All servers participating in a distributed query must agree on this value: with `distributed_aggregation_memory_efficient`, two-level bucket numbers depend on the key hash, which differs between the two methods, so servers disagreeing on this setting may split the same key into different buckets and produce an incorrectly merged result. To guarantee agreement, the initiator always sends its effective value with the secondary queries (even when it comes only from server/profile defaults), overriding the remote servers' own defaults.
   * @since 26.9
   */
  enable_packed_string_keys_in_aggregation?: boolean;

  /**
   * Parallelize the final merge of the per-thread single-level aggregation hash tables. The key space is split into disjoint partitions by key hash, and each partition is merged independently: the merging thread enumerates all per-thread tables and combines the keys that belong to its partition, so no two threads ever touch the same key. If the setting is turned off, the single-level tables are merged serially on one thread. Aggregation by 8- and 16-bit keys keeps its own range-partitioned parallel merge regardless of this setting.
   * @since 26.9
   */
  enable_parallel_single_level_merge?: boolean;

  /**
   * If true then data can be parsed directly to columns with custom serialization (e.g. Sparse) according to hints for serialization got from the table.
   */
  enable_parsing_to_custom_serialization?: boolean;

  /**
   * Enables the `PCO` compression codec.
   * @since 26.11
   */
  enable_pco_codec?: boolean;

  /**
   * Enables or disables supporting positional arguments for [GROUP BY](/reference/statements/select/group-by), [LIMIT BY](/reference/statements/select/limit-by), [ORDER BY](/reference/statements/select/order-by) statements. Possible values: - 0 — Positional arguments aren't supported. - 1 — Positional arguments are supported: column numbers can use instead of column names. **Example** Query: ```sql CREATE TABLE positional_arguments(one Int, two Int, three Int) ENGINE=Memory(); INSERT INTO positional_arguments VALUES (10, 20, 30), (20, 20, 10), (30, 10, 20); SELECT * FROM positional_arguments ORDER BY 2,3; ``` Result: ```text ┌─one─┬─two─┬─three─┐ │ 30 │ 10 │ 20 │ │ 20 │ 20 │ 10 │ │ 10 │ 20 │ 30 │ └─────┴─────┴───────┘ ```
   */
  enable_positional_arguments?: boolean;

  /**
   * Enables or disables supporting positional arguments in PROJECTION definitions. See also [enable_positional_arguments](#enable_positional_arguments) setting. <Note> This is an expert-level setting, and you shouldn't change it if you're just getting started with ClickHouse. </Note> Possible values: - 0 — Positional arguments aren't supported. - 1 — Positional arguments are supported: column numbers can use instead of column names.
   * @since 26.1
   */
  enable_positional_arguments_for_projections?: boolean;

  /**
   * Allow memory-efficient aggregation (see `distributed_aggregation_memory_efficient`) to produce buckets out of order. It may improve performance when aggregation bucket sizes are skewed by letting a replica to send buckets with higher id-s to the initiator while it is still processing some heavy buckets with lower id-s. The downside is potentially higher memory usage.
   * @since 25.10
   */
  enable_producing_buckets_out_of_order_in_aggregation?: boolean;

  /**
   * Enables the `Quantized` compression codec.
   * @since 26.9
   */
  enable_quantized_codec?: boolean;

  /**
   * Whether to read from the columns cache when `use_columns_cache` is enabled. Accepts 0 or 1. By default, 1 (enabled).
   * @since 26.11
   */
  enable_reads_from_columns_cache?: boolean;

  /**
   * If turned on, results of `SELECT` queries are retrieved from the [query cache](/concepts/features/performance/caches/query-cache). Possible values: - 0 - Disabled - 1 - Enabled
   */
  enable_reads_from_query_cache?: boolean;

  /**
   * If turned on (and [query_cache_on_disk_cache_name](#query_cache_on_disk_cache_name) is set), results of `SELECT` queries are retrieved from the [query cache](/concepts/features/performance/caches/query-cache) on disk. If reads are enabled for both the in-memory and the on-disk query cache, the lookup is attempted first from memory and only on a miss from disk. Possible values: - 0 - Disabled - 1 - Enabled
   * @since 26.11
   */
  enable_reads_from_query_cache_on_disk?: boolean;

  /**
   * Enable very explicit logging of S3 requests. Makes sense for debug only.
   */
  enable_s3_requests_logging?: boolean;

  /**
   * If it is set to true, prevent scalar subqueries from (de)serializing large scalar values and possibly avoid running the same subquery more than once.
   */
  enable_scalar_subquery_optimization?: boolean;

  /**
   * If disabled, declarations in parent WITH cluases will behave the same scope as they declared in the current scope. Note that this is a compatibility setting for the analyzer to allow running some invalid queries that old analyzer could execute.
   * @since 25.8
   */
  enable_scopes_for_with_statement?: boolean;

  /**
   * If enabled, all subqueries within a single query will share the same StorageSnapshot for each table. This ensures a consistent view of the data across the entire query, even if the same table is accessed multiple times. This is required for queries where internal consistency of data parts is important. Example: ```sql SELECT count() FROM events WHERE (_part, _part_offset) IN ( SELECT _part, _part_offset FROM events WHERE user_id = 42 ) ``` Without this setting, the outer and inner queries may operate on different data snapshots, leading to incorrect results. Possible values: - 0 - Disabled - 1 - Enabled
   * @since 25.7
   */
  enable_shared_storage_snapshot_in_query?: boolean;

  /**
   * Allow sharing set objects build for IN subqueries between different tasks of the same mutation. This reduces memory usage and CPU consumption
   */
  enable_sharing_sets_for_mutations?: boolean;

  /**
   * Enable use of software prefetch in aggregation
   */
  enable_software_prefetch_in_aggregation?: boolean;

  /**
   * Enable use of software prefetch in hash join probe phase to hide memory access latency for large hash tables.
   * @since 26.6
   */
  enable_software_prefetch_in_join?: boolean;

  /**
   * Allow `SELECT ... FROM t STREAM [CURSOR '{...}']` continuous queries. When off, any table expression using the `STREAM` modifier is rejected at plan-build time. This is the umbrella gate for the streaming-queries feature; additional capabilities may be gated by their own settings.
   * @since 26.7
   */
  enable_streaming_queries?: boolean;

  /**
   * Enables the `SZ3` compression codec.
   * @since 26.9
   */
  enable_sz3_codec?: boolean;

  /**
   * Enables the `timeSeries*` aggregate functions for Prometheus-like time series resampling, rate, and delta calculation.
   * @since 26.10
   */
  enable_time_series_aggregate_functions?: boolean;

  /**
   * Allows creation of tables with the [TimeSeries](/reference/engines/table-engines/integrations/time-series) table engine. Possible values: - 0 — the [TimeSeries](/reference/engines/table-engines/integrations/time-series) table engine is disabled. - 1 — the [TimeSeries](/reference/engines/table-engines/integrations/time-series) table engine is enabled.
   * @since 26.10
   */
  enable_time_series_table?: boolean;

  /**
   * Allows creation of [Time](/reference/data-types/time) and [Time64](/reference/data-types/time64) data types.
   * @since 26.1
   */
  enable_time_time64_type?: boolean;

  /**
   * Enable the `trino` value of the `dialect` setting. When `dialect` is set to `trino`, queries are written in Trino SQL: Trino-specific syntax (`ARRAY[...]` literals, `TRY_CAST`, `UNNEST`, `ROW` types, `OFFSET` before `LIMIT`) is translated to ClickHouse SQL, and Trino function names are mapped to their ClickHouse equivalents. The `SET` query is still parsed as plain SQL so that the dialect can be switched back. The dialect also aligns the query semantics with Trino: `join_use_nulls` is turned on, `use_variant_as_common_type` is turned off, and the query analyzer is turned on. An explicit `SETTINGS` clause in the query still takes precedence.
   * @since 26.10
   */
  enable_trino_dialect?: boolean;

  /**
   * Allow ARRAY JOIN with multiple arrays that have different sizes. When this settings is enabled, arrays will be resized to the longest one.
   */
  enable_unaligned_array_join?: boolean;

  /**
   * Allows creation of tables with the `UNIQUE KEY` clause on MergeTree-family engines.
   * @since 26.10
   */
  enable_unique_key?: boolean;

  /**
   * Allows to enable/disable decoding/encoding path in uri in [URL](/reference/engines/table-engines/special/url) engine tables. Disabled by default.
   */
  enable_url_encoding?: boolean;

  /**
   * If enable, remove duplicated rows during FINAL by marking rows as deleted and filtering them later instead of merging rows
   */
  enable_vertical_final?: boolean;

  /**
   * Whether to write to the columns cache when `use_columns_cache` is enabled. Accepts 0 or 1. By default, 1 (enabled).
   * @since 26.11
   */
  enable_writes_to_columns_cache?: boolean;

  /**
   * If turned on, results of `SELECT` queries are stored in the [query cache](/concepts/features/performance/caches/query-cache). Possible values: - 0 - Disabled - 1 - Enabled
   */
  enable_writes_to_query_cache?: boolean;

  /**
   * If turned on (and [query_cache_on_disk_cache_name](#query_cache_on_disk_cache_name) is set), results of `SELECT` queries are stored in the [query cache](/concepts/features/performance/caches/query-cache) on disk. Possible values: - 0 - Disabled - 1 - Enabled
   * @since 26.11
   */
  enable_writes_to_query_cache_on_disk?: boolean;

  /**
   * Enable the experimental XGBoost integration: the `XGBOOST` dictionary layout and the `predictXGBoost` function.
   * @since 26.11
   */
  enable_xgboost?: boolean;

  /**
   * Enables the `ZXC` compression codec.
   * @since 26.9
   */
  enable_zxc_codec?: boolean;

  /**
   * If enabled, only allow identifiers containing alphanumeric characters and underscores.
   */
  enforce_strict_identifier_format?: boolean;

  /**
   * Enables or disables creating a new file on each insert in file engine tables if the format has the suffix (`JSON`, `ORC`, `Parquet`, etc.). If enabled, on each insert a new file will be created with a name following this pattern: `data.Parquet` -> `data.1.Parquet` -> `data.2.Parquet`, etc. Possible values: - 0 — `INSERT` query appends new data to the end of the file. - 1 — `INSERT` query creates a new file.
   */
  engine_file_allow_create_multiple_files?: boolean;

  /**
   * Allows to select data from a file engine table without file. Possible values: - 0 — `SELECT` throws exception. - 1 — `SELECT` returns empty result.
   */
  engine_file_empty_if_not_exists?: boolean;

  /**
   * Enables or disables skipping empty files in [File](/reference/engines/table-engines/special/file) engine tables. Possible values: - 0 — `SELECT` throws an exception if empty file is not compatible with requested format. - 1 — `SELECT` returns empty result for empty file.
   */
  engine_file_skip_empty_files?: boolean;

  /**
   * Enables or disables truncate before insert in [File](/reference/engines/table-engines/special/file) engine tables. Possible values: - 0 — `INSERT` query appends new data to the end of the file. - 1 — `INSERT` query replaces existing content of the file with the new data.
   */
  engine_file_truncate_on_insert?: boolean;

  /**
   * Enables or disables skipping empty files in [URL](/reference/engines/table-engines/special/url) engine tables. Possible values: - 0 — `SELECT` throws an exception if empty file is not compatible with requested format. - 1 — `SELECT` returns empty result for empty file.
   */
  engine_url_skip_empty_files?: boolean;

  /**
   * Makes `/` and `divide` return an integer when both operands are integer types, including `Int128`, `UInt128`, `Int256`, and `UInt256`. The quotient is truncated toward zero. The result has the width of the first operand and is signed if either operand is signed. Division by zero or a quotient outside the result type's range throws an exception. `Nullable` operands propagate `NULL`. By default, division of two integers returns `Float64`. This setting does not change division involving `Decimal` or floating-point operands, or the explicit functions `intDiv`, `divideDecimal`, and `divideOrNull`. The choice is recorded in newly submitted SQL before expressions are stored in table metadata, views, SQL functions, or mutations. Existing definitions and `ATTACH` queries retain their original division semantics, independently of this setting.
   * @since 26.11
   */
  exact_division_for_integers?: boolean;

  /**
   * When enabled, ClickHouse will provide exact value for rows_before_limit_at_least statistic, but with the cost that the data before limit will have to be read completely
   * @since 26.2
   */
  exact_rows_before_limit?: boolean;

  /**
   * Set default mode in EXCEPT query. Possible values: empty string, 'ALL', 'DISTINCT'. If empty, query without mode will throw exception.
   */
  except_default_mode?: "ALL" | "DISTINCT";

  /**
   * Excludes specified skip indexes from being built and stored during INSERTs. The excluded skip indexes will still be built and stored [during merges](/reference/settings/merge-tree-settings/materialize#materialize_skip_indexes_on_merge) or by an explicit [MATERIALIZE INDEX](/reference/statements/alter/skipping-index#materialize-index) query. Has no effect if [materialize_skip_indexes_on_insert](#materialize_skip_indexes_on_insert) is false. Example: ```sql CREATE TABLE tab ( a UInt64, b UInt64, INDEX idx_a a TYPE minmax, INDEX idx_b b TYPE set(3) ) ENGINE = MergeTree ORDER BY tuple(); SET exclude_materialize_skip_indexes_on_insert='idx_a'; -- idx_a will be not be updated upon insert --SET exclude_materialize_skip_indexes_on_insert='idx_a, idx_b'; -- neither index would be updated on insert INSERT INTO tab SELECT number, number / 50 FROM numbers(100); -- only idx_b is updated -- since it is a session setting it can be set on a per-query level INSERT INTO tab SELECT number, number / 50 FROM numbers(100, 100) SETTINGS exclude_materialize_skip_indexes_on_insert='idx_b'; ALTER TABLE tab MATERIALIZE INDEX idx_a; -- this query can be used to explicitly materialize the index SET exclude_materialize_skip_indexes_on_insert = DEFAULT; -- reset setting to default ```
   * @since 25.11
   */
  exclude_materialize_skip_indexes_on_insert?: string;

  /**
   * Execute non-correlated EXISTS subqueries as scalar subqueries. As for scalar subqueries, the cache is used, and the constant folding applies to the result. Cloud default value: `0`.
   * @since 25.9
   */
  execute_exists_as_scalar_subquery?: boolean;

  /**
   * Default format used by `EXPLAIN PLAN`. Possible values: - `pretty` (default since 26.7) — `actions`, `compact`, and `pretty` default to `true`, producing a compact, pretty, action-annotated plan. - `legacy` — pre-26.7 output. Specifying the `actions`, `compact`, or `pretty` options explicitly in the `EXPLAIN` statement (for example, `EXPLAIN actions = 0, compact = 0, pretty = 0 SELECT ...`) always overrides this setting. `EXPLAIN PLAN` with `json = 1` or `distributed = 1` keeps the legacy (pre-26.7) defaults regardless of this setting, unless `actions`, `compact`, or `pretty` are set explicitly. The pretty output cannot represent JSON results or per-shard distributed plans, so those modes are only rendered correctly in legacy form.
   * @since 26.8
   */
  explain_query_plan_default?: "legacy" | "pretty";

  /**
   * Return `EXPLAIN SYNTAX` output as a single record (with embedded newlines) instead of one record per line, so the result is a single, recoverable row (for example, `SELECT count() FROM (EXPLAIN SYNTAX ...)` returns `1`). Specifying the `single_record` option explicitly in the `EXPLAIN SYNTAX` statement (for example, `EXPLAIN SYNTAX single_record = 0 SELECT ...`) always overrides this setting. Set to `false` to restore the pre-26.8 one-record-per-line output, or set `compatibility` to any version older than `26.8`.
   * @since 26.9
   */
  explain_syntax_single_record?: boolean;

  /**
   * Connect timeout in seconds. Now supported only for MySQL
   */
  external_storage_connect_timeout_sec?: bigint;

  /**
   * Limit maximum number of bytes when table with external engine should flush history data. Now supported only for MySQL table engine, database engine, and dictionary. If equal to 0, this setting is disabled
   */
  external_storage_max_read_bytes?: bigint;

  /**
   * Limit maximum number of rows when table with external engine should flush history data. Now supported only for MySQL table engine, database engine, and dictionary. If equal to 0, this setting is disabled
   */
  external_storage_max_read_rows?: bigint;

  /**
   * Allow to push the query's `LIMIT` clause down into the query sent to an external database (such as MySQL, PostgreSQL or SQLite). The push-down is not performed for the generic ODBC/JDBC bridges, because they do not expose the remote `LIMIT` syntax, and some of the supported databases do not accept a `LIMIT` clause at all. The `LIMIT` is pushed down only when it is guaranteed to be safe, i.e. when every clause that logically applies before it is copied to the external query without changes. Precisely, the query must be a plain single-table `SELECT`: - there is no `JOIN`, `ARRAY JOIN`, `SAMPLE` or `FINAL` (otherwise rows could be dropped or transformed locally, so pre-limiting is unwanted); - the `WHERE` clause, if any, is fully compatible and copied into the rewritten query unchanged (otherwise filtering after the remote `LIMIT` would drop some rows); - there is no other clause or modifier (like `DISTINCT`, `GROUP BY`, `ORDER BY`, `LIMIT BY`, `WITH TIES`, etc.) that may break the remote pre-limiting logic due to data reordering, aggregation or filtration; - an `OFFSET` is allowed: it is applied locally, so the rows it skips have to be read as well, and the limit sent to the external database is `offset + length`; - the `SELECT` list maps one source row to one result row, i.e. it contains no aggregate functions, window functions or `arrayJoin` (also spelled `unnest`) (they are evaluated locally over all the rows read from the external table); - there is no filter that is applied locally on top of the rows read from the external table, such as a row policy or `additional_table_filters` (such a filter runs before the `LIMIT`, so pre-limiting remotely could discard rows that it would have kept). This reduces the amount of data read from and sent by the external database. Disable this setting to restore the previous behavior in case of compatibility issues.
   * @since 26.11
   */
  external_storage_push_down_limit?: boolean;

  /**
   * Read/write timeout in seconds. Now supported only for MySQL
   */
  external_storage_rw_timeout_sec?: bigint;

  /**
   * Defines how [mysql](/reference/functions/table-functions/mysql), [postgresql](/reference/functions/table-functions/postgresql) and [odbc](/reference/functions/table-functions/odbc) table functions use Nullable columns. Possible values: - 0 — The table function explicitly uses Nullable columns. - 1 — The table function implicitly uses Nullable columns. **Usage** If the setting is set to `0`, the table function does not make Nullable columns and inserts default values instead of NULL. This is also applicable for NULL values inside arrays.
   */
  external_table_functions_use_nulls?: boolean;

  /**
   * If it is set to true, a filter on the columns of an external table (`MySQL`, `PostgreSQL`, `SQLite`, `ODBC`, `JDBC`) that cannot be pushed down to the external database is rejected with an exception instead of being applied locally after the data is fetched. The check covers the top-level `WHERE` predicate and each conjunct of a top-level `AND`. A `PREWHERE` on the columns of the external table is not a case for this setting: these table engines do not support `PREWHERE`, and such a query is rejected with `ILLEGAL_PREWHERE` regardless of the setting. The check runs only where a filter could be pushed down at all: when the external table is the only table of the query, on either side of an `INNER JOIN`, or on the preserving side of an outer join (the left side of a `LEFT JOIN`, the right side of a `RIGHT JOIN`). On the non-preserving side of a `LEFT`/`RIGHT JOIN` and on either side of a `FULL JOIN` nothing is pushed down and nothing is checked, so a filter on the columns of the external table is applied locally after the join even in strict mode. Where the check runs, a predicate that references other tables joined in the surrounding query is not pushed down and is excluded from the check, whether it references only the joined side (for example `WHERE r.flag`) or mixes it with the external table inside one non-`AND` expression (for example `WHERE l.id = 1 OR r.flag`); such a predicate keeps its usual ClickHouse evaluation point (`WHERE` after the join, `PREWHERE` before it) and is not rejected.
   */
  external_table_strict_query?: boolean;

  /**
   * Max number of pairs that can be produced by the `extractKeyValuePairs` function. Used as a safeguard against consuming too much memory.
   */
  extract_key_value_pairs_max_pairs_per_row?: bigint;

  /**
   * Whether to count extreme values (the minimums and maximums in columns of a query result). Accepts 0 or 1. By default, 0 (disabled). For more information, see the section "Extreme values".
   */
  extremes?: boolean;

  /**
   * Forces a query to an out-of-date replica if updated data is not available. See [Replication](/reference/engines/table-engines/mergetree-family/replication). ClickHouse selects the most relevant from the outdated replicas of the table. Used when performing `SELECT` from a distributed table that points to replicated tables. By default, 1 (enabled).
   */
  fallback_to_stale_replicas_for_distributed_queries?: boolean;

  /**
   * Default partition strategy for file like engines. Applied only to `CREATE` queries with a path that has no glob or `{_partition_id}` placeholder. A path with `{_partition_id}` always uses `wildcard`. A path with another glob uses no partition strategy and ignores `PARTITION BY`. If this setting is `wildcard` but the path has no `{_partition_id}`, no partition strategy is used; table engines that can not persist this decision in their engine arguments (e.g. `HDFS`) reject such a `CREATE` instead.
   * @since 26.7
   */
  file_like_engine_default_partition_strategy?: "wildcard" | "hive";

  /**
   * Allow filesystem cache to enqueue background downloads for data read from remote storage. Disable to keep downloads in the foreground for the current query/session.
   * @since 25.12
   */
  filesystem_cache_allow_background_download?: boolean;

  /**
   * Filesystem cache boundary alignment. For non-disk read (e.g. for cache of remote table engines / table functions) value 0 means no alignment. For disk read (e.g. for MergeTree tables on a disk with cache) value 0 means that `boundary_alignment` from the cache configuration is used.
   * @since 24.12
   */
  filesystem_cache_boundary_alignment?: bigint;

  /**
   * Only has an effect in ClickHouse Cloud. Wait time to lock cache for space reservation in filesystem cache
   * @since 24.12
   */
  filesystem_cache_enable_background_download_during_fetch?: boolean;

  /**
   * Only has an effect in ClickHouse Cloud. Wait time to lock cache for space reservation in filesystem cache
   * @since 24.12
   */
  filesystem_cache_enable_background_download_for_metadata_files_in_packed_storage?: boolean;

  /**
   * Max remote filesystem cache size that can be downloaded by a single query
   */
  filesystem_cache_max_download_size?: bigint;

  /**
   * Filesystem cache name to use for stateless table engines or data lakes
   */
  filesystem_cache_name?: string;

  /**
   * Prefer bigger buffer size if filesystem cache is enabled to avoid writing small file segments which deteriorate cache performance. On the other hand, enabling this setting might increase memory usage.
   * @since 24.12
   */
  filesystem_cache_prefer_bigger_buffer_size?: boolean;

  /**
   * Wait time to lock cache for space reservation in filesystem cache
   */
  filesystem_cache_reserve_space_wait_lock_timeout_milliseconds?: bigint;

  /**
   * Limit on size of a single batch of file segments that a read buffer can request from cache. Too low value will lead to excessive requests to cache, too large may slow down eviction from cache
   */
  filesystem_cache_segments_batch_size?: bigint;

  /**
   * Skip download from remote filesystem if exceeds query cache size
   * @since 24.12
   */
  filesystem_cache_skip_download_if_exceeds_per_query_cache_write_limit?: boolean;

  /**
   * Emit `TEST`-level log messages for every filesystem cache buffer refill (state of the read, remaining size to read, bytes read). Only for debugging: the messages are formatted once per read, so enabling it on a query that does many small cached reads adds a large amount of logging overhead. The messages are only visible when the log level is `test` anyway (see `send_logs_level`).
   * @since 26.9
   */
  filesystem_cache_verbose_logging?: boolean;

  /**
   * Maximum time to wait for a file segment which is being downloaded to the filesystem cache by a concurrent query. When the timeout is reached, the read bypasses the filesystem cache for that range and reads directly from remote storage, while the concurrent download continues to fill the cache. Value `0` means do not wait at all: bypass the cache immediately if the needed range is not downloaded yet. Lowering this value bounds the tail latency of cache-hit reads which would otherwise wait for another query's download pace at the cost of additional requests to remote storage.
   * @since 26.9
   */
  filesystem_cache_wait_for_concurrent_download_timeout_milliseconds?: bigint;

  /**
   * Maximum memory usage for prefetches. Cloud default value: 10% of total memory.
   */
  filesystem_prefetch_max_memory_usage?: bigint;

  /**
   * Prefetch step in bytes. Zero means `auto` - approximately the best prefetch step will be auto deduced, but might not be 100% the best. The actual value might be different because of setting filesystem_prefetch_min_bytes_for_single_read_task
   */
  filesystem_prefetch_step_bytes?: bigint;

  /**
   * Prefetch step in marks. Zero means `auto` - approximately the best prefetch step will be auto deduced, but might not be 100% the best. The actual value might be different because of setting filesystem_prefetch_min_bytes_for_single_read_task
   */
  filesystem_prefetch_step_marks?: bigint;

  /**
   * Maximum number of prefetches. Zero means unlimited. A setting `filesystem_prefetches_max_memory_usage` is more recommended if you want to limit the number of prefetches
   */
  filesystem_prefetches_limit?: bigint;

  /**
   * Adds a `WHERE` clause to the query as a wrapping subquery. Multiple filters are combined with AND. The HTTP interface allows multiple `filter` URL parameters which are combined with AND in order, and with the value of this setting. This is a query-construction setting applied by the engine on the parsed query (wrapping it as a derived table), so it composes with the existing query and works on every protocol: it can be supplied via the HTTP URL parameter, an in-query `SETTINGS` clause, or a user profile. It shapes result-producing `SELECT` / `UNION` queries. For a write query (`INSERT … SELECT`, `CREATE … AS SELECT`) it takes effect only when the source `SELECT` carries it in its own `SETTINGS` clause; a value inherited from a profile or session, or set on the `INSERT` / `CREATE` statement itself, does not propagate into the source `SELECT` — the same non-propagation rule that applies to any other setting. <Danger> `filter` is **not** an access-control mechanism and must not be used as a substitute for [row-level security policies](/operations/access-rights#row-policy-management) or the `additional_table_filters` setting. It only adds a `WHERE` over the wrapping subquery, so the underlying data is still read and processed before the filter is applied — a query can observe the filtered-out rows during processing (for example with `throwIf` to leak information through the error path). Use row-level security or `additional_table_filters` when the goal is to restrict which rows a user may access. </Danger>
   * @since 26.9
   */
  filter?: string;

  /**
   * Automatically applies [FINAL](/reference/statements/select/from#final-modifier) modifier to all tables in a query, to tables where [FINAL](/reference/statements/select/from#final-modifier) is applicable, including joined tables and tables in sub-queries, and distributed tables. Possible values: - 0 - disabled - 1 - enabled Example: ```sql CREATE TABLE test ( key Int64, some String ) ENGINE = ReplacingMergeTree ORDER BY key; INSERT INTO test FORMAT Values (1, 'first'); INSERT INTO test FORMAT Values (1, 'second'); SELECT * FROM test; ┌─key─┬─some───┐ │ 1 │ second │ └─────┴────────┘ ┌─key─┬─some──┐ │ 1 │ first │ └─────┴───────┘ SELECT * FROM test SETTINGS final = 1; ┌─key─┬─some───┐ │ 1 │ second │ └─────┴────────┘ SET final = 1; SELECT * FROM test; ┌─key─┬─some───┐ │ 1 │ second │ └─────┴────────┘ ```
   */
  final?: boolean;

  /**
   * When enabled, projection parts are finalized synchronously during INSERT, reducing peak memory usage at the cost of reduced S3 upload parallelism. By default, each projection's output stream is kept alive until the entire part (including all projections) is finalized, which allows overlapping S3 uploads but increases peak memory proportional to the number of projections. This setting only affects the INSERT path; merge and mutation already finalize projections synchronously.
   * @since 26.5
   */
  finalize_projection_parts_synchronously?: boolean;

  /**
   * Sets the data format of a [nested](/reference/data-types/nested-data-structures/index) columns. Possible values: - 1 — Nested column is flattened to separate arrays. - 0 — Nested column stays a single array of tuples. **Usage** If the setting is set to `0`, it is possible to use an arbitrary level of nesting. **Examples** Query: ```sql SET flatten_nested = 1; CREATE TABLE t_nest (`n` Nested(a UInt32, b UInt32)) ENGINE = MergeTree ORDER BY tuple(); SHOW CREATE TABLE t_nest; ``` Result: ```text ┌─statement───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐ │ CREATE TABLE default.t_nest ( `n.a` Array(UInt32), `n.b` Array(UInt32) ) ENGINE = MergeTree ORDER BY tuple() SETTINGS index_granularity = 8192 │ └─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘ ``` Query: ```sql SET flatten_nested = 0; CREATE TABLE t_nest (`n` Nested(a UInt32, b UInt32)) ENGINE = MergeTree ORDER BY tuple(); SHOW CREATE TABLE t_nest; ``` Result: ```text ┌─statement──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐ │ CREATE TABLE default.t_nest ( `n` Nested(a UInt32, b UInt32) ) ENGINE = MergeTree ORDER BY tuple() SETTINGS index_granularity = 8192 │ └────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘ ```
   */
  flatten_nested?: boolean;

  /**
   * Force the use of optimization when it is applicable, but heuristics decided not to use it
   */
  force_aggregate_partitions_independently?: boolean;

  /**
   * The setting is used by the server itself to support distributed queries. Do not change it manually, because it will break normal operations. (Forces use of aggregation in order on remote nodes during distributed aggregation).
   */
  force_aggregation_in_order?: boolean;

  /**
   * Force per-partition pre-deduplication for `IN (subquery)` set building when it is applicable, but the partition-skew check (largest partition more than twice the average) decided not to use it. Only bypasses the skew check of [allow_creating_set_partitions_independently](#allow_creating_set_partitions_independently); the remaining conditions still apply.
   * @since 26.9
   */
  force_creating_set_partitions_independently?: boolean;

  /**
   * Disables query execution if passed data skipping indices wasn't used. Consider the following example: ```sql CREATE TABLE data ( key Int, d1 Int, d1_null Nullable(Int), INDEX d1_idx d1 TYPE minmax GRANULARITY 1, INDEX d1_null_idx assumeNotNull(d1_null) TYPE minmax GRANULARITY 1 ) Engine=MergeTree() ORDER BY key; SELECT * FROM data_01515; SELECT * FROM data_01515 SETTINGS force_data_skipping_indices=''; -- query will produce CANNOT_PARSE_TEXT error. SELECT * FROM data_01515 SETTINGS force_data_skipping_indices='d1_idx'; -- query will produce INDEX_NOT_USED error. SELECT * FROM data_01515 WHERE d1 = 0 SETTINGS force_data_skipping_indices='d1_idx'; -- Ok. SELECT * FROM data_01515 WHERE d1 = 0 SETTINGS force_data_skipping_indices='`d1_idx`'; -- Ok (example of full featured parser). SELECT * FROM data_01515 WHERE d1 = 0 SETTINGS force_data_skipping_indices='`d1_idx`, d1_null_idx'; -- query will produce INDEX_NOT_USED error, since d1_null_idx is not used. SELECT * FROM data_01515 WHERE d1 = 0 AND assumeNotNull(d1_null) = 0 SETTINGS force_data_skipping_indices='`d1_idx`, d1_null_idx'; -- Ok. ```
   * @since 26.11
   */
  force_data_skipping_indexes?: string;

  /**
   * Force independent `DISTINCT` evaluation per partition when it is applicable, but the cost heuristic decided not to use it. Only bypasses the cost heuristic of [allow_distinct_partitions_independently](#allow_distinct_partitions_independently); the remaining conditions still apply.
   * @since 26.9
   */
  force_distinct_partitions_independently?: boolean;

  /**
   * Make GROUPING function to return 1 when argument is not used as an aggregation key
   */
  force_grouping_standard_compatibility?: boolean;

  /**
   * Disables query execution if the index can't be used by date. Works with tables in the MergeTree family. If `force_index_by_date=1`, ClickHouse checks whether the query has a date key condition that can be used for restricting data ranges. If there is no suitable condition, it throws an exception. However, it does not check whether the condition reduces the amount of data to read. For example, the condition `Date != ' 2000-01-01 '` is acceptable even when it matches all the data in the table (i.e., running the query requires a full scan). For more information about ranges of data in MergeTree tables, see [MergeTree](/reference/engines/table-engines/mergetree-family/mergetree).
   */
  force_index_by_date?: boolean;

  /**
   * Enables or disables the obligatory use of [projections](/reference/engines/table-engines/mergetree-family/mergetree#projections) in `SELECT` queries, when projection optimization is enabled (see [optimize_use_projections](#optimize_use_projections) setting). When enabled, a projection that can serve the query is used even if it requires reading more marks than the table itself, and the query fails with the `PROJECTION_NOT_USED` error when no projection can be used. Possible values: - 0 — Projection optimization is not obligatory. - 1 — Projection optimization is obligatory.
   */
  force_optimize_projection?: boolean;

  /**
   * If it is set to a non-empty string, check that this projection is used in the query at least once. Possible values: - string: name of projection that used in a query
   */
  force_optimize_projection_name?: string;

  /**
   * Enables or disables query execution if [optimize_skip_unused_shards](#optimize_skip_unused_shards) is enabled and skipping of unused shards is not possible. If the skipping is not possible and the setting is enabled, an exception will be thrown. Possible values: - 0 — Disabled. ClickHouse does not throw an exception. - 1 — Enabled. Query execution is disabled only if the table has a sharding key. - 2 — Enabled. Query execution is disabled regardless of whether a sharding key is defined for the table.
   */
  force_optimize_skip_unused_shards?: bigint;

  /**
   * Controls [`force_optimize_skip_unused_shards`](#force_optimize_skip_unused_shards) (hence still requires [`force_optimize_skip_unused_shards`](#force_optimize_skip_unused_shards)) depends on the nesting level of the distributed query (case when you have `Distributed` table that look into another `Distributed` table). Possible values: - 0 - Disabled, `force_optimize_skip_unused_shards` works always. - 1 — Enables `force_optimize_skip_unused_shards` only for the first level. - 2 — Enables `force_optimize_skip_unused_shards` up to the second level.
   */
  force_optimize_skip_unused_shards_nesting?: bigint;

  /**
   * Disables query execution if indexing by the primary key is not possible. Works with tables in the MergeTree family. If `force_primary_key=1`, ClickHouse checks to see if the query has a primary key condition that can be used for restricting data ranges. If there is no suitable condition, it throws an exception. However, it does not check whether the condition reduces the amount of data to read. For more information about data ranges in MergeTree tables, see [MergeTree](/reference/engines/table-engines/mergetree-family/mergetree).
   */
  force_primary_key?: boolean;

  /**
   * Only has an effect in ClickHouse Cloud. Overrides the server setting `enable_read_through_distributed_cache` for a single query. `auto` (the default) means to follow the server setting.
   * @since 26.10
   */
  force_read_through_distributed_cache?: string;

  /**
   * Recursively remove data on DROP query. Avoids 'Directory not empty' error, but may silently remove detached data
   */
  force_remove_data_recursively_on_drop?: boolean;

  /**
   * Force independent evaluation of window functions per partition when it is applicable, but the cost heuristic decided not to use it. Only bypasses the cost heuristic of [allow_window_partitions_independently](#allow_window_partitions_independently); the remaining conditions still apply.
   * @since 26.9
   */
  force_window_partitions_independently?: boolean;

  /**
   * Only has an effect in ClickHouse Cloud. Overrides the server setting `enable_write_through_distributed_cache` for a single query. `auto` (the default) means to follow the server setting.
   * @since 26.10
   */
  force_write_through_distributed_cache?: string;

  /**
   * Overrides the `FORMAT` of the query for both input and output. Wins over the format specified in the query and in the file extension. The more specific `input_format` and `output_format` settings take precedence over this generic `format` setting for their respective direction.
   * @since 26.9
   */
  format?: string;

  /**
   * Formatter '%e' in function 'formatDateTime' prints single-digit days with a leading space, e.g. ' 2' instead of '2'.
   * @since 25.6
   */
  formatdatetime_e_with_space_padding?: boolean;

  /**
   * Formatter '%f' in function 'formatDateTime' prints only the scale amount of digits for a DateTime64 instead of fixed 6 digits.
   * @since 25.2
   */
  formatdatetime_f_prints_scale_number_of_digits?: boolean;

  /**
   * Formatter '%f' in function 'formatDateTime' prints a single zero instead of six zeros if the formatted value has no fractional seconds.
   */
  formatdatetime_f_prints_single_zero?: boolean;

  /**
   * Formatters '%c', '%l' and '%k' in function 'formatDateTime' print months and hours without leading zeros.
   */
  formatdatetime_format_without_leading_zeros?: boolean;

  /**
   * Formatter '%M' in functions 'formatDateTime' and 'parseDateTime' print/parse the month name instead of minutes.
   */
  formatdatetime_parsedatetime_m_is_month_name?: boolean;

  /**
   * Allows to multiplex different parts of the query response in a single stream: chunks of data, totals and extremes, progress packets, profile events (metrics), and server logs - everything that the native protocol supports. Framing formats are independent of output formats: they encapsulate bytes produced by any output format, by separating and potentially encoding these chunks of bytes. The concatenation of the payloads of all `data`, `totals` and `extremes` packets is exactly what the output format would have produced without framing. Auxiliary packets (progress, logs, profile events, exceptions) are represented as JSON. One deliberate exception: an output format that drops totals and extremes in its plain output because it cannot represent them (the `JSONCompactEachRow` family) does emit them under framing, into the `totals` and `extremes` packets. For such formats the concatenation of the `data` packets alone is exactly the unframed output, and the `totals` and `extremes` packets carry additional rows that the unframed output does not contain. Server logs are included if the `send_logs_level` setting is set, and profile events are included if the `send_profile_events` setting is enabled (they are sent at most once in `interactive_delay` microseconds, and progress packets are also throttled by `interactive_delay`). A successful stream ends with a final `progress` packet carrying the final counters (`result_rows`, `result_bytes`, `memory_usage`), written after the trailing `log` and `profile_events` packets emitted by the query-finish logging, like the final progress packet of the native protocol. On failure, the `exception` packet is the last packet instead - with one exception: when the failure happens after part of the packet stream has already been produced into the response and can no longer be discarded (a packet write fails partway through, the delivery of the `exception` packet itself fails, or the response stream fails while being flushed or closed), the framing fails closed - the stream is terminated without a terminal `exception` packet, and the client observes a truncated response and an aborted HTTP connection instead of a parseable terminal packet. Nothing is ever appended after a partial packet stream, so a plain HTTP error body is never mixed into it. Anything a query enables only through its own `SETTINGS` clause - a framing format, `send_logs_level`, or `send_profile_events` - is not known until the query has been parsed, so the corresponding logs and profile events are captured only from query execution onwards. The logs and profile events of the parse, plan, and analysis phase are captured only when the setting comes from the session or the URL. For example, a query that fails during analysis (such as a reference to an unknown table) and enables `send_logs_level` only in its `SETTINGS` clause delivers just the `exception` packet, not the analysis-phase logs; set `send_logs_level` on the session or the URL to capture those. The same late-discovery caveat applies to `send_logs_source_regexp`: the log queue filters entries by source at the moment each entry is captured, so a regexp set only in the query's own `SETTINGS` clause takes effect from query execution onwards. The `log` packets of the parse, plan, and analysis phase are filtered by the session or URL value of the setting (they are unfiltered when it is not set there), so they may include sources that do not match the query-level regexp; conversely, entries dropped by a narrower session or URL regexp are not recovered by a broader query-level one. Set `send_logs_source_regexp` on the session or the URL to filter the whole query lifecycle. The setting currently applies to the HTTP protocol and is ignored for other interfaces. Possible values: - `None` - transparently routes everything applicable (data, totals, extremes, progress) to the output format, and ignores everything that is not applicable (metrics, logs), so everything works as it is by default. - `EventStream` - frames packets as HTTP server-sent events (`text/event-stream`). Every packet is sent as an event with the corresponding name: `data`, `totals`, `extremes`, `progress`, `log`, `profile_events`, `exception`. Progress and other auxiliary packets are sent as JSON. Because server-sent events are a text protocol that treats line breaks (including carriage returns, `r`) as delimiters, a block of formatted data is base64-encoded into a single `data` field of the event, which decodes to the fully formatted payload with all of its newlines; the `Content-Type` carries a `payload=base64` parameter to say so. Any output format can be carried this way byte-exactly, text and binary alike. - `JSONEachPacketBase64` - every packet is a JSON object on a separate line, and the formatted data is base64-encoded, e.g. `{"packet":"data","data":"eyJ4IjoxfQo="}`. Suitable for binary output formats. - `JSONEachPacketString` - every packet is a JSON object on a separate line, and the formatted data is put into a string, e.g. `{"packet":"data","data":"{"x":1}n"}`. `JSONEachPacketString` puts the payload bytes into a JSON string without validating or re-encoding them. `String` and `FixedString` columns can hold arbitrary bytes, so text output formats (such as `JSONEachRow`, `TSV`, or `CSV`) may emit invalid UTF-8 for such values - just as ClickHouse's own `JSONEachRow` does with the default `output_format_json_validate_utf8 = 0` - and then the resulting NDJSON stream is not guaranteed to be valid UTF-8. Use `JSONEachPacketBase64` for byte-exact transport of arbitrary bytes. Example: ```bash curl "http://localhost:8123/?framing_output_format=JSONEachPacketString" -d "SELECT number FROM numbers(3) FORMAT JSONEachRow" ``` Result: ```text {"packet":"data","data":"{"number":"0"}n{"number":"1"}n{"number":"2"}n"} {"packet":"profile_events","profile_events":[{"host_name":"localhost","current_time":"2026-07-11 00:00:00","thread_id":"0","type":"increment","name":"SelectedRows","value":"3"}]} {"packet":"progress","progress":{"read_rows":"3","read_bytes":"24","total_rows_to_read":"3","result_rows":"3","result_bytes":"24","elapsed_ns":"1265958"}} ```
   * @since 26.9
   */
  framing_output_format?: string;

  /**
   * Enables or disables [fsync](http://pubs.opengroup.org/onlinepubs/9699919799/functions/fsync.html) when writing `.sql` files. Enabled by default. It makes sense to disable it if the server has millions of tiny tables that are constantly being created and destroyed.
   */
  fsync_metadata?: boolean;

  /**
   * Maximum size, in bytes, of a single input value for the functions `base58Encode`, `base58Decode` and `tryBase58Decode`. The generic `base58` conversion is quadratic in the input length, so a single large value can run for a very long time. `base58` is meant for short data (keys, hashes, addresses), so the default of 10 KB is a generous safety threshold. `base58Encode` and `base58Decode` throw `TOO_LARGE_STRING_SIZE` for larger inputs, while `tryBase58Decode` returns an empty string. A value of `0` disables the limit (the behavior before this setting was introduced). The linear `base32` and `base64` functions are unaffected.
   * @since 26.7
   */
  function_base58_max_input_size?: bigint;

  /**
   * Allows to change the behaviour of the result type of `dateTrunc` function. Possible values: - 0 - When the second argument is `DateTime64/Date32` the return type will be `DateTime64/Date32` regardless of the time unit in the first argument. - 1 - For `Date32` the result is always `Date`. For `DateTime64` the result is `DateTime` for time units `second` and higher.
   * @since 25.8
   */
  function_date_trunc_return_type_behavior?: bigint;

  /**
   * Control whether allow to return complex type (such as: struct, array, map) for json_value function. ```sql SELECT JSON_VALUE('{"hello":{"world":"!"}}', '$.hello') settings function_json_value_return_type_allow_complex=true ┌─JSON_VALUE('{"hello":{"world":"!"}}', '$.hello')─┐ │ {"world":"!"} │ └──────────────────────────────────────────────────┘ 1 row in set. Elapsed: 0.001 sec. ``` Possible values: - true — Allow. - false — Disallow.
   */
  function_json_value_return_type_allow_complex?: boolean;

  /**
   * Control whether allow to return `NULL` when value is not exist for JSON_VALUE function. ```sql SELECT JSON_VALUE('{"hello":"world"}', '$.b') settings function_json_value_return_type_allow_nullable=true; ┌─JSON_VALUE('{"hello":"world"}', '$.b')─┐ │ ᴺᵁᴸᴸ │ └────────────────────────────────────────┘ 1 row in set. Elapsed: 0.001 sec. ``` Possible values: - true — Allow. - false — Disallow.
   */
  function_json_value_return_type_allow_nullable?: boolean;

  /**
   * Controls the order of arguments in function [locate](/reference/functions/regular-functions/string-search-functions#locate). Possible values: - 0 — Function `locate` accepts arguments `(haystack, needle[, start_pos])`. - 1 — Function `locate` accepts arguments `(needle, haystack, [, start_pos])` (MySQL-compatible behavior)
   */
  function_locate_has_mysql_compatible_argument_order?: boolean;

  /**
   * Sets the safety threshold for data volume generated by function [range](/reference/functions/regular-functions/array-functions#range). Defines the maximum number of values generated by function per block of data (sum of array sizes for every row in a block). Possible values: - Positive integer. **See Also** - [`max_block_size`](#max_block_size) - [`min_insert_block_size_rows`](#min_insert_block_size_rows)
   */
  function_range_max_elements_in_block?: bigint;

  /**
   * Maximum number of microseconds the function `sleep` is allowed to sleep for each block. If a user called it with a larger value, it throws an exception. It is a safety threshold.
   */
  function_sleep_max_microseconds_per_block?: bigint;

  /**
   * The version of `visibleWidth` behavior. 0 - only count the number of code points; 1 - correctly count zero-width and combining characters, count full-width characters as two, estimate the tab width, count delete characters.
   */
  function_visible_width_behavior?: bigint;

  /**
   * If all four arguments to `geoDistance`, `greatCircleDistance`, `greatCircleAngle` functions are Float64, return Float64 and use double precision for internal calculations. In previous ClickHouse versions, the functions always returned Float32.
   */
  geo_distance_returns_float64_on_float64_arguments?: boolean;

  /**
   * Function 'geoToH3' accepts (lon, lat) if set to 'lon_lat' and (lat, lon) if set to 'lat_lon'.
   * @since 25.7
   */
  geotoh3_argument_order?: "lat_lon" | "lon_lat";

  /**
   * Defines how many milliseconds a Keeper client waits to acquire the corresponding `Context` mutex before failing. The value is taken from the `Context` that performs the acquisition. A per-query override applies only when the operation uses the query context, such as reads from `system.zookeeper`, `zookeeperSessionUptime`, `SYSTEM RECONNECT ZOOKEEPER`, and query-context auxiliary Keeper access. Operations that use a global or background context, including `BACKUP` and `RESTORE` coordination and `Replicated` database activity, use that context's value instead, and get the timeout as a Keeper error (`ZOPERATIONTIMEOUT`) that they handle like other Keeper errors. `SYSTEM RELOAD CONFIG` and `SYSTEM RELOAD ASYNCHRONOUS METRICS` are not covered because they use independently serialized reload paths. Possible values: - Positive integer (in milliseconds). - 0 — No locking timeout.
   * @since 26.11
   */
  get_zookeeper_lock_acquire_timeout_ms?: number;

  /**
   * Maximum number of allowed addresses (For external storages, table functions, etc). The `url` table function and the `URL` table engine generate the addresses of a pattern one by one, so for them this limits how many addresses a single query is allowed to generate rather than how large the pattern is. A query that stops early, for example under a `LIMIT`, can use a pattern that describes many more addresses than this. A `_path` or `_file` predicate is applied to every generated address, so the ones it rejects are counted as well.
   */
  glob_expansion_max_elements?: bigint;

  /**
   * Initial number of grace hash join buckets
   */
  grace_hash_join_initial_buckets?: bigint;

  /**
   * Limit on the number of grace hash join buckets
   */
  grace_hash_join_max_buckets?: bigint;

  /**
   * Sets what happens when the number of unique keys for aggregation exceeds the limit: - `throw`: throw an exception - `break`: stop executing the query and return the partial result - `any`: continue aggregation for the keys that got into the set, but do not add new keys to the set. Using the 'any' value lets you run an approximation of GROUP BY. The quality of this approximation depends on the statistical nature of the data.
   */
  group_by_overflow_mode?: "throw" | "break" | "any";

  /**
   * For `enable_group_by_top_k_optimization`: the number of rows each aggregation stream observes before freezing a full top-K heap that skipped less than 10% of input rows and evicted fewer keys than its capacity. A frozen heap means aggregation continues as if the optimization were disabled. The effective window is at least twice the heap's reserved size, so a heap always gets a chance to fill before being judged. `0` disables this freeze (the heap still freezes when a boundary tie-set overgrows it). This has no effect on `GROUP BY keys LIMIT K` queries without `ORDER BY`, where the freeze is always disabled: that shape's plan contains a synthesized sort that only pays off while the heap bounds the hash table, so freezing the heap would leave a plan slower than the un-optimized one.
   * @since 26.9
   */
  group_by_top_k_optimization_observation_rows?: bigint;

  /**
   * For `enable_group_by_top_k_optimization`: share the tightest skip boundary between the aggregation threads. Each thread publishes the boundary of its own top-K set once per processed block when it has tightened, and every thread skips rows against the best published boundary instead of only its own. A set of `K` keys strictly better than a row proves the row cannot reach the final result regardless of which thread holds them, so the sharing does not change the result; it only lets threads whose local keys rank poorly (e.g. when the key values are clustered across the table) skip rows they would otherwise aggregate for nothing. Possible values: - 0 — Disabled. - 1 — Enabled.
   * @since 26.11
   */
  group_by_top_k_optimization_shared_boundary?: boolean;

  /**
   * From what number of keys, a two-level aggregation starts. 0 - the threshold is not set.
   */
  group_by_two_level_threshold?: bigint;

  /**
   * From what size of the aggregation state in bytes, a two-level aggregation begins to be used. 0 - the threshold is not set. Two-level aggregation is used when at least one of the thresholds is triggered.
   */
  group_by_two_level_threshold_bytes?: bigint;

  /**
   * Changes the way the [GROUP BY clause](/reference/statements/select/group-by) treats the types of aggregation keys. When the `ROLLUP`, `CUBE`, or `GROUPING SETS` specifiers are used, some aggregation keys may not be used to produce some result rows. Columns for these keys are filled with either default value or `NULL` in corresponding rows depending on this setting. Possible values: - 0 — The default value for the aggregation key type is used to produce missing values. - 1 — ClickHouse executes `GROUP BY` the same way as the SQL standard says. The types of aggregation keys are converted to [Nullable](/reference/data-types/nullable). Columns for corresponding aggregation keys are filled with [NULL](/reference/syntax#null) for rows that didn't use it. See also: - [GROUP BY clause](/reference/statements/select/group-by)
   */
  group_by_use_nulls?: boolean;

  /**
   * Function 'h3ToGeo' returns (lon, lat) if true, otherwise (lat, lon).
   * @since 25.2
   */
  h3togeo_lon_lat_result_order?: boolean;

  /**
   * Timeout in milliseconds for receiving Hello packet from replicas during handshake.
   */
  handshake_timeout_ms?: number;

  /**
   * Enables or disables creating a new file on each insert in HDFS engine tables. If enabled, on each insert a new HDFS file will be created with the name, similar to this pattern: initial: `data.Parquet.gz` -> `data.1.Parquet.gz` -> `data.2.Parquet.gz`, etc. Possible values: - 0 — `INSERT` query appends new data to the end of the file. - 1 — `INSERT` query creates a new file.
   */
  hdfs_create_new_file_on_insert?: boolean;

  /**
   * Ignore absence of file if it does not exist when reading certain keys. Possible values: - 1 — `SELECT` returns empty result. - 0 — `SELECT` throws an exception.
   */
  hdfs_ignore_file_doesnt_exist?: boolean;

  /**
   * The actual number of replications can be specified when the hdfs file is created.
   */
  hdfs_replication?: bigint;

  /**
   * Enables or disables skipping empty files in [HDFS](/reference/engines/table-engines/integrations/hdfs) engine tables. Possible values: - 0 — `SELECT` throws an exception if empty file is not compatible with requested format. - 1 — `SELECT` returns empty result for empty file.
   */
  hdfs_skip_empty_files?: boolean;

  /**
   * Throw an error if matched zero files according to glob expansion rules. Possible values: - 1 — `SELECT` throws an exception. - 0 — `SELECT` returns empty result.
   */
  hdfs_throw_on_zero_files_match?: boolean;

  /**
   * Enables or disables truncation before an insert in hdfs engine tables. If disabled, an exception will be thrown on an attempt to insert if a file in HDFS already exists. Possible values: - 0 — `INSERT` query appends new data to the end of the file. - 1 — `INSERT` query replaces existing content of the file with the new data.
   */
  hdfs_truncate_on_insert?: boolean;

  /**
   * Connection timeout for establishing connection with replica for Hedged requests
   */
  hedged_connection_timeout_ms?: number;

  /**
   * Sets the maximum number of highlight matches per row in the [highlight](/reference/functions/regular-functions/string-search-functions#highlight) function. Use it to protect against excessive memory usage when highlighting highly repetitive patterns in large texts. Possible values: - Positive integer.
   * @since 26.5
   */
  highlight_max_matches_per_row?: bigint;

  /**
   * The size of the dynamic candidate list when searching the vector similarity index, also known as 'ef_search'.
   */
  hnsw_candidate_list_size_for_search?: bigint;

  /**
   * Expired time for HSTS. 0 means disable HSTS.
   */
  hsts_max_age?: bigint;

  /**
   * If enabled, the HTTP interface recognizes a `/database/` component in the URL path and uses it as the current database. This is a per-user setting that controls whether a routed path-style request is interpreted. Routing itself is gated globally by the server-level `http_allow_path_requests` configuration setting (on by default), which must be enabled for the HTTP interface to route a path-style request (such as `/my_db/my_table.csv`) to the query handler at all — that routing decision is made before the request is authenticated, so it cannot depend on a per-user setting. When `http_allow_path_requests` is off, unknown paths return a plain `404`. After routing, this setting is re-checked against the authenticated user's effective settings, so it can be disabled selectively per user, role, or profile.
   * @since 26.9
   */
  http_allow_database_as_path?: boolean;

  /**
   * If enabled, the HTTP interface recognizes `/name=value/` components in the path (hive partitioning style) and translates them to filters combined with AND. Operators `>`, `<`, `>=`, `<=`, `!=`, `<>` are also recognized. Like [`http_allow_database_as_path`](#http_allow_database_as_path), this is a per-user setting; routing of path-style requests is gated globally by the server-level `http_allow_path_requests` configuration setting (routing happens before authentication).
   * @since 26.9
   */
  http_allow_filters_as_path?: boolean;

  /**
   * If enabled, any URL parameter not recognized as a known parameter, setting, or `param_*` prefix is treated as a filter and combined with AND. Two forms are accepted: - A plain `name=value` becomes the equality `` `name` = 'value' `` (the identifier is back-quoted, the value is quoted as a string literal). - A comparison operator (`!=`, `>`, `<`, `>=`, `<=`, `<>`) makes it a comparison: either split across the parameter (`?a!=2`, `?a>=2`) or written inline when the URL has no `=` to split on (`?a<>2`, `?f(x)>3`), in which case the reassembled `name[=value]` is parsed as a full SQL expression. Disabled by default, unlike the other `http_allow_*` settings: it applies to every request of the HTTP interface, including the `/?query=...` endpoint, so enabling it turns any unrecognized URL parameter a client appends (a request id, a signature, a cache buster) into a filter of the query. A misspelt setting name is then no longer reported as `UNKNOWN_SETTING` but fails with `UNKNOWN_IDENTIFIER` (or, if the name happens to match a column, silently filters the result), and the parameter value becomes part of the query text, where it is not masked like the `Request URI` in the log.
   * @since 26.9
   */
  http_allow_filters_as_unrecognized_url_parameters?: boolean;

  /**
   * If enabled, the HTTP interface recognizes the last URL path component as a table name in the form `table`, `table.format`, or `table.format.compression`. The path is interpreted as `SELECT * FROM table`. Like [`http_allow_database_as_path`](#http_allow_database_as_path), this is a per-user setting; routing of path-style requests is gated globally by the server-level `http_allow_path_requests` configuration setting (routing happens before authentication).
   * @since 26.9
   */
  http_allow_table_as_file?: boolean;

  /**
   * HTTP connection timeout (in seconds). Possible values: - Any positive integer. - 0 - Disabled (infinite timeout).
   */
  http_connection_timeout?: number;

  /**
   * Do not send HTTP headers X-ClickHouse-Progress more frequently than at each specified interval.
   */
  http_headers_progress_interval_ms?: bigint;

  /**
   * Maximum time in seconds to read all HTTP request headers. This is a total deadline for the entire header parsing phase, not a per-read timeout. Protects against slowloris-style attacks where a client trickles header data slowly to hold connections open.
   * @since 26.5
   */
  http_headers_read_timeout?: number;

  /**
   * The `http_make_head_request` setting allows the execution of a `HEAD` request while reading data from HTTP to retrieve information about the file to be read, such as its size. Since it's enabled by default, it may be desirable to disable this setting in cases where the server does not support `HEAD` requests.
   */
  http_make_head_request?: boolean;

  /**
   * Maximum length of a field name in HTTP request headers, query parameters, and form data.
   */
  http_max_field_name_size?: bigint;

  /**
   * Maximum length of a field value in HTTP request headers, query parameters, and form data.
   */
  http_max_field_value_size?: bigint;

  /**
   * Maximum number of fields in HTTP request headers, query parameters, and form data.
   */
  http_max_fields?: bigint;

  /**
   * Limit on size of multipart/form-data content. This setting cannot be parsed from URL parameters and should be set in a user profile. Note that content is parsed and external tables are created in memory before the start of query execution. And this is the only limit that has an effect on that stage (limits on max memory usage and max execution time have no effect while reading HTTP form data).
   */
  http_max_multipart_form_data_size?: bigint;

  /**
   * Maximum total size of all HTTP request headers (names and values combined) in bytes.
   * @since 26.5
   */
  http_max_request_header_size?: bigint;

  /**
   * Limit on size of request data used as a query parameter in predefined HTTP requests.
   */
  http_max_request_param_data_size?: bigint;

  /**
   * Max attempts to read via http.
   */
  http_max_tries?: bigint;

  /**
   * Sets the maximum URI length of an HTTP request. Possible values: - Positive integer.
   */
  http_max_uri_size?: bigint;

  /**
   * Enables or disables checksum verification when decompressing the HTTP POST data from the client. Used only for ClickHouse native compression format (not used with `gzip` or `deflate`). For more information, read the [HTTP interface description](/concepts/features/interfaces/http). Possible values: - 0 — Disabled. - 1 — Enabled.
   */
  http_native_compression_disable_checksumming_on_decompress?: boolean;

  /**
   * HTTP receive timeout (in seconds). Possible values: - Any positive integer (seconds). `0` is **not** an infinite timeout and can cause connection setup failures (POSIX socket timeouts require a positive interval).
   */
  http_receive_timeout?: number;

  /**
   * The number of bytes to buffer in the server memory before sending a HTTP response to the client or flushing to disk (when http_wait_end_of_query is enabled).
   */
  http_response_buffer_size?: bigint;

  /**
   * Allows to add or override HTTP headers which the server will return in the response with a successful query result. This only affects the HTTP interface. If the header is already set by default, the provided value will override it. If the header was not set by default, it will be added to the list of headers. Headers that are set by the server by default and not overridden by this setting, will remain. The setting allows you to set a header to a constant value. Currently there is no way to set a header to a dynamically calculated value. Neither names nor values can contain ASCII control characters. If you implement a UI application which allows users to modify settings but at the same time makes decisions based on the returned headers, it is recommended to restrict this setting to readonly. Example: `SET http_response_headers = $${'Content-Type': 'image/png'}$$`
   * @since 25.1
   */
  http_response_headers?: string;

  /**
   * Min milliseconds for backoff, when retrying read via http
   */
  http_retry_initial_backoff_ms?: bigint;

  /**
   * Max milliseconds for backoff, when retrying read via http
   */
  http_retry_max_backoff_ms?: bigint;

  /**
   * HTTP send timeout (in seconds). Possible values: - Any positive integer (seconds). `0` is **not** an infinite timeout and can cause connection setup failures (POSIX socket timeouts require a positive interval). <Note> It's applicable only to the default profile. A server reboot is required for the changes to take effect. </Note>
   */
  http_send_timeout?: number;

  /**
   * Skip URLs for globs with HTTP_NOT_FOUND error
   */
  http_skip_not_found_url_for_globs?: boolean;

  /**
   * Enable HTTP response buffering on the server-side.
   */
  http_wait_end_of_query?: boolean;

  /**
   * Write exception in output format to produce valid output. Works with JSON and XML formats.
   */
  http_write_exception_in_output_format?: boolean;

  /**
   * Controls which setting the `X-ClickHouse-Format` HTTP header maps to. If enabled (the default), the header is an alias for the `output_format` setting: it is an explicit override of the response format that wins over the `FORMAT` clause in the query and over the file extension in the URL path. If disabled, the header is an alias for the `default_format` setting, as it was before version 26.8: it only selects the format used when the query has no `FORMAT` clause and no other format override is applied. In both cases the header overrides the URL parameter of the same name (`output_format` or `default_format`, respectively) and never changes how the request body of an `INSERT` is parsed. This is a compatibility setting for the HTTP interface: the header is consumed before the query is parsed, so it must be supplied via a URL parameter or a user profile, not via an in-query `SETTINGS` clause. Like `output_format` and `default_format` themselves, it can always be changed in read-only mode (`readonly = 1`), so a read-only user can pass it as a URL parameter.
   * @since 26.11
   */
  http_x_clickhouse_format_overrides_output_format?: boolean;

  /**
   * Sets the level of data compression in the response to an HTTP request if [enable_http_compression = 1](#enable_http_compression). Possible values: Numbers from 1 to 12. Levels above `9` require the default build with `libdeflate`; a build without `libdeflate` supports levels 1 to 9.
   */
  http_zlib_compression_level?: bigint;

  /**
   * Number of merged data files that background Iceberg compaction accumulates before publishing them in a new snapshot. Compaction results are published in any case once there are no candidates left to compact, so this setting only bounds how long already merged files stay unpublished while compaction keeps finding new work. `0` restores the old behaviour of publishing only when compaction runs out of candidates - a state that is never reached while the table keeps receiving new data files, so every merged output is then written to object storage and never referenced by a snapshot.
   * @since 26.10
   */
  iceberg_compaction_commit_batch_size?: bigint;

  /**
   * The time after which the data will be deleted.
   * @since 26.6
   */
  iceberg_compaction_data_cleanup?: number;

  /**
   * Minimum time of delay between 2 background compaction operations.
   * @since 26.6
   */
  iceberg_compaction_delay_bias?: number;

  /**
   * Max bytes of an iceberg parquet data file produced by compaction. The default mirrors the documented default of the Iceberg table property `write.target-file-size-bytes` (512 MiB), see https://iceberg.apache.org/docs/1.5.2/configuration/. Keep it above `iceberg_data_file_size_lower_threshold_compaction`, otherwise every output file stays below the lower threshold and is selected for compaction again.
   * @since 26.10
   */
  iceberg_compaction_max_bytes_in_data_file?: bigint;

  /**
   * Max rows of an iceberg parquet data file produced by compaction. Defaults to the maximum, so the size limit `iceberg_compaction_max_bytes_in_data_file` alone decides how much data goes into an output file, the same way Iceberg has no row-count counterpart of `write.target-file-size-bytes`.
   * @since 26.10
   */
  iceberg_compaction_max_rows_in_data_file?: bigint;

  /**
   * Data files smaller than this are selected for compaction. The default is `0.75` of the documented default of the Iceberg table property `write.target-file-size-bytes` (512 MiB), which is how the `rewrite_data_files` procedure derives its `min-file-size-bytes` option, see https://iceberg.apache.org/docs/1.5.2/configuration/.
   * @since 26.6
   */
  iceberg_data_file_size_lower_threshold_compaction?: bigint;

  /**
   * Data files larger than this are selected for compaction. The default is `1.8` of the documented default of the Iceberg table property `write.target-file-size-bytes` (512 MiB), which is how the `rewrite_data_files` procedure derives its `max-file-size-bytes` option, see https://iceberg.apache.org/docs/1.5.2/configuration/.
   * @since 26.6
   */
  iceberg_data_file_size_upper_threshold_compaction?: bigint;

  /**
   * Whether to delete all iceberg files on drop or not.
   * @since 25.10
   */
  iceberg_delete_data_on_drop?: boolean;

  /**
   * Default value for Iceberg table property `history.expire.max-ref-age-ms` used by `expire_snapshots` when that property is absent.
   * @since 26.4
   */
  iceberg_expire_default_max_ref_age_ms?: bigint;

  /**
   * Default value for Iceberg table property `history.expire.max-snapshot-age-ms` used by `expire_snapshots` when that property is absent.
   * @since 26.4
   */
  iceberg_expire_default_max_snapshot_age_ms?: bigint;

  /**
   * Default value for Iceberg table property `history.expire.min-snapshots-to-keep` used by `expire_snapshots` when that property is absent.
   * @since 26.4
   */
  iceberg_expire_default_min_snapshots_to_keep?: bigint;

  /**
   * Capacity of the queue between the Iceberg data manifest decode tasks and the query, in data file entries. The decode tasks pause once the queue is full and the query is not consuming, so this also bounds the read-ahead. Must be greater than zero.
   * @since 26.10
   */
  iceberg_file_entries_queue_size?: bigint;

  /**
   * Max bytes of iceberg parquet data file on insert operation. The default mirrors the documented default of the Iceberg table property `write.target-file-size-bytes` (512 MiB), see https://iceberg.apache.org/docs/1.5.2/configuration/. Note that ClickHouse compares the limit against the uncompressed size of the data written into the file so far, while the Iceberg property targets the size of the resulting file, and that `iceberg_insert_max_rows_in_data_file` caps the file independently of its size.
   * @since 25.11
   */
  iceberg_insert_max_bytes_in_data_file?: bigint;

  /**
   * Max allowed partitions count per one insert operation for Iceberg table engine.
   * @since 26.1
   */
  iceberg_insert_max_partitions?: bigint;

  /**
   * Max rows of iceberg parquet data file on insert operation.
   * @since 25.11
   */
  iceberg_insert_max_rows_in_data_file?: bigint;

  /**
   * Maximum number of Iceberg manifest files decoded concurrently while reading a table. Delete manifests are all decoded before any data file is read; data manifests are decoded while the list of data files for the query is produced, and new ones are decoded only as the query consumes already decoded entries. Decoding several manifests at a time overlaps the object storage round-trips and the per-entry pruning work. Higher values raise peak memory when the Iceberg metadata files cache is disabled or full, since each in-flight manifest then holds its own decoded contents. Must be greater than zero; `1` decodes the manifests one at a time.
   * @since 26.10
   */
  iceberg_manifest_decode_concurrency?: bigint;

  /**
   * Minimum number of manifest files required to trigger manifest-only compaction via OPTIMIZE TABLE ... MANIFEST. If the current number of manifest files is less than or equal to this threshold, compaction is skipped. Requires allow_experimental_iceberg_compaction to be enabled. The default mirrors the documented default of the Iceberg table property `commit.manifest.min-count-to-merge` (100), see https://iceberg.apache.org/docs/1.5.2/configuration/.
   * @since 26.8
   */
  iceberg_manifest_min_count_to_compact?: bigint;

  /**
   * Threshold for compaction data files in iceberg.
   * @since 26.6
   */
  iceberg_max_number_datafiles_to_compact?: bigint;

  /**
   * Method to compress `.metadata.json` file. An empty string lets the catalog choose the codec when it writes the first metadata file. Set `none` to request uncompressed metadata.
   * @since 25.9
   */
  iceberg_metadata_compression_method?: string;

  /**
   * Controls the level of metadata logging for Iceberg tables to system.iceberg_metadata_log. Usually this setting can be modified for debugging purposes. Possible values: - none - No metadata log. - metadata - Root metadata.json file. - manifest_list_metadata - Everything above + metadata from avro manifest list which corresponds to a snapshot. - manifest_list_entry - Everything above + avro manifest list entries. - manifest_file_metadata - Everything above + metadata from traversed avro manifest files. - manifest_file_entry - Everything above + traversed avro manifest files entries.
   * @since 25.10
   */
  iceberg_metadata_log_level?:
    | "none"
    | "metadata"
    | "manifest_list_metadata"
    | "manifest_list_entry"
    | "manifest_file_metadata"
    | "manifest_file_entry";

  /**
   * If non-zero, skip fetching iceberg metadata from remote catalog if there is a cached metadata snapshot, more recent than the given staleness window. Zero means to always fetch the latest metadata version from the remote catalog. Setting this a non-zero trades staleness to a lower latency of read operations.
   * @since 26.4
   */
  iceberg_metadata_staleness_ms?: bigint;

  /**
   * Minimum age in seconds of the files that `ALTER TABLE ... EXECUTE remove_orphan_files` may delete from an Iceberg table. An `older_than` (given explicitly or derived from `iceberg_orphan_files_older_than_seconds`) that is closer to now than this is rejected: files of a write that has not committed yet are not referenced by the table metadata and would be deleted, which corrupts the table when the write commits. Keep it above the longest time a write to the table can take to commit. 0 disables the check.
   * @since 26.11
   */
  iceberg_orphan_files_min_retention_seconds?: bigint;

  /**
   * Default age threshold in seconds for orphan file removal in Iceberg tables. Files newer than this are not considered orphans. Used when the older_than argument is omitted from the remove_orphan_files() procedure call. Default is 259200 (3 days).
   * @since 26.5
   */
  iceberg_orphan_files_older_than_seconds?: bigint;

  /**
   * Query Iceberg table using the specific snapshot id.
   * @since 25.5
   */
  iceberg_snapshot_id?: bigint;

  /**
   * Query Iceberg table using the snapshot that was current at a specific timestamp.
   * @since 25.5
   */
  iceberg_timestamp_ms?: bigint;

  /**
   * If enabled and the schema-id of an Iceberg manifest file is already registered from metadata.json, the metadata.json schema is used and the copy in the `schema` key of the manifest file header is ignored without being compared. If disabled, the manifest header copy is compared with the metadata.json schema, and a conflict fails the query with an ICEBERG_SPECIFICATION_VIOLATION error. The manifest header schema is only a copy of the table schema at the time the manifest was written, and some writers (e.g. AWS S3 Tables maintenance jobs) have been observed storing degraded copies there. Other query engines resolve schemas from metadata.json and ignore divergent header copies, so the default follows them. A conflict between two metadata.json schema definitions still always fails the query.
   * @since 26.11
   */
  iceberg_tolerate_conflicting_manifest_schemas?: boolean;

  /**
   * Timeout to close idle TCP connections after specified number of seconds. Possible values: - Positive integer (0 - close immediately, after 0 seconds).
   */
  idle_connection_timeout?: bigint;

  /**
   * Only has an effect in ClickHouse Cloud. Exclude new data parts from SELECT queries until they're either pre-warmed (see [cache_populated_by_fetch](/reference/settings/merge-tree-settings/cache-populated-by-fetch#cache_populated_by_fetch)) or this many seconds old. Only for Replicated-/SharedMergeTree.
   */
  ignore_cold_parts_seconds?: bigint;

  /**
   * Ignores the skipping indexes specified if used by the query. Consider the following example: ```sql CREATE TABLE data ( key Int, x Int, y Int, INDEX x_idx x TYPE minmax GRANULARITY 1, INDEX y_idx y TYPE minmax GRANULARITY 1, INDEX xy_idx (x,y) TYPE minmax GRANULARITY 1 ) Engine=MergeTree() ORDER BY key; INSERT INTO data VALUES (1, 2, 3); SELECT * FROM data; SELECT * FROM data SETTINGS ignore_data_skipping_indices=''; -- query will produce CANNOT_PARSE_TEXT error. SELECT * FROM data SETTINGS ignore_data_skipping_indices='x_idx'; -- Ok. SELECT * FROM data SETTINGS ignore_data_skipping_indices='na_idx'; -- Ok. SELECT * FROM data WHERE x = 1 AND y = 1 SETTINGS ignore_data_skipping_indices='xy_idx',force_data_skipping_indices='xy_idx' ; -- query will produce INDEX_NOT_USED error, since xy_idx is explicitly ignored. SELECT * FROM data WHERE x = 1 AND y = 2 SETTINGS ignore_data_skipping_indices='xy_idx'; ``` The query without ignoring any indexes: ```sql EXPLAIN indexes = 1 SELECT * FROM data WHERE x = 1 AND y = 2; Expression ((Projection + Before ORDER BY)) Filter (WHERE) ReadFromMergeTree (default.data) Indexes: PrimaryKey Condition: true Parts: 1/1 Granules: 1/1 Skip Name: x_idx Description: minmax GRANULARITY 1 Parts: 0/1 Granules: 0/1 Skip Name: y_idx Description: minmax GRANULARITY 1 Parts: 0/0 Granules: 0/0 Skip Name: xy_idx Description: minmax GRANULARITY 1 Parts: 0/0 Granules: 0/0 ``` Ignoring the `xy_idx` index: ```sql EXPLAIN indexes = 1 SELECT * FROM data WHERE x = 1 AND y = 2 SETTINGS ignore_data_skipping_indices='xy_idx'; Expression ((Projection + Before ORDER BY)) Filter (WHERE) ReadFromMergeTree (default.data) Indexes: PrimaryKey Condition: true Parts: 1/1 Granules: 1/1 Skip Name: x_idx Description: minmax GRANULARITY 1 Parts: 0/1 Granules: 0/1 Skip Name: y_idx Description: minmax GRANULARITY 1 Parts: 0/0 Granules: 0/0 ``` Works with tables in the MergeTree family.
   * @since 26.11
   */
  ignore_data_skipping_indexes?: string;

  /**
   * If enabled, server will ignore all DROP table queries with specified probability (for Memory and JOIN engines it will replace DROP to TRUNCATE). Used for testing purposes
   */
  ignore_drop_queries_probability?: number;

  /**
   * If enabled, `FORMAT Null` will be ignored for `EXPLAIN` queries and default output format will be used instead. When disabled, `EXPLAIN` queries with `FORMAT Null` will produce no output (backward compatible behavior).
   * @since 26.3
   */
  ignore_format_null_for_explain?: boolean;

  /**
   * Ignore MVs with dropped target table during pushing to views
   */
  ignore_materialized_views_with_dropped_target_table?: boolean;

  /**
   * Ignore ON CLUSTER clause for replicated access entities management queries.
   */
  ignore_on_cluster_for_replicated_access_entities_queries?: boolean;

  /**
   * Always ignore ON CLUSTER clause for DDL queries with replicated databases.
   * @since 26.2
   */
  ignore_on_cluster_for_replicated_database?: boolean;

  /**
   * Ignore ON CLUSTER clause for replicated handler management queries.
   * @since 26.9
   */
  ignore_on_cluster_for_replicated_handler_queries?: boolean;

  /**
   * Ignore ON CLUSTER clause for replicated named collections management queries.
   */
  ignore_on_cluster_for_replicated_named_collections_queries?: boolean;

  /**
   * Ignore ON CLUSTER clause for replicated UDF management queries.
   */
  ignore_on_cluster_for_replicated_udf_queries?: boolean;

  /**
   * Allow writing simple SELECT queries without the leading SELECT keyword, which makes it simple for calculator-style usage, e.g. `1 + 2` becomes a valid query. In `clickhouse-local` it is enabled by default and can be explicitly disabled.
   */
  implicit_select?: boolean;

  /**
   * If not empty, queries without FROM at the top level will read from this table instead of system.one. This is used in clickhouse-local for input data processing. The setting could be set explicitly by a user but is not intended for this type of usage. Subqueries are not affected by this setting (neither scalar, FROM, or IN subqueries). SELECTs at the top level of UNION, INTERSECT, EXCEPT chains are treated uniformly and affected by this setting, regardless of their grouping in parentheses. It is unspecified how this setting affects views and distributed queries. The setting accepts a table name (then the table is resolved from the current database) or a qualified name in the form of 'database.table'. Both database and table names have to be unquoted - only simple identifiers are allowed.
   * @since 25.6
   */
  implicit_table_at_top_level?: string;

  /**
   * If enabled and not already inside a transaction, wraps the query inside a full transaction (begin + commit or rollback)
   */
  implicit_transaction?: boolean;

  /**
   * If enabled, injects 'ORDER BY rand()' into SELECT queries without ORDER BY clause. Applied only for subquery depth = 0. Subqueries and INSERT INTO ... SELECT are not affected. If the top-level construct is UNION, 'ORDER BY rand()' is injected into all children independently. Only useful for testing and development (missing ORDER BY is a source of non-deterministic query results).
   * @since 25.11
   */
  inject_random_order_for_select_without_order_by?: boolean;

  /**
   * Overrides the input format of the query. Wins over the format specified in the query.
   * @since 26.9
   */
  input_format?: string;

  /**
   * If setting is enabled, Allow materialized columns in INSERT.
   */
  insert_allow_materialized_columns?: boolean;

  /**
   * Enables or disables block deduplication of `INSERT` (for Replicated* tables). This setting only takes effect when [`deduplicate_insert`](#deduplicate_insert) is set to `backward_compatible_choice`. Possible values: - 0 — Disabled. - 1 — Enabled. By default, blocks inserted into replicated tables by the `INSERT` statement are deduplicated (see [Data Replication](/reference/engines/table-engines/mergetree-family/replication)). For the replicated tables by default the only 100 of the most recent blocks for each partition are deduplicated (see [replicated_deduplication_window](/reference/settings/merge-tree-settings/replicated-deduplication-window#replicated_deduplication_window), [replicated_deduplication_window_seconds](/reference/settings/merge-tree-settings/replicated-deduplication-window#replicated_deduplication_window_seconds)). For not replicated tables see [non_replicated_deduplication_window](/reference/settings/merge-tree-settings/other#non_replicated_deduplication_window).
   */
  insert_deduplicate?: boolean;

  /**
   * The setting allows a user to provide own deduplication semantic in MergeTree/ReplicatedMergeTree For example, by providing a unique value for the setting in each INSERT statement, user can avoid the same inserted data being deduplicated. Possible values: - Any string `insert_deduplication_token` is used for deduplication _only_ when not empty. For the replicated tables by default the only 100 of the most recent inserts for each partition are deduplicated (see [replicated_deduplication_window](/reference/settings/merge-tree-settings/replicated-deduplication-window#replicated_deduplication_window), [replicated_deduplication_window_seconds](/reference/settings/merge-tree-settings/replicated-deduplication-window#replicated_deduplication_window_seconds)). For not replicated tables see [non_replicated_deduplication_window](/reference/settings/merge-tree-settings/other#non_replicated_deduplication_window). <Note> `insert_deduplication_token` is tracked per partition, so multiple partitions written by one insert can carry the same token. Without a token, the default content checksum is computed over the whole inserted block, so an insert is deduplicated only when its entire data matches a previous insert (a retry), not when a single partition's rows happen to coincide with a different insert. </Note> Example: ```sql CREATE TABLE test_table ( A Int64 ) ENGINE = MergeTree ORDER BY A SETTINGS non_replicated_deduplication_window = 100; INSERT INTO test_table SETTINGS insert_deduplication_token = 'test' VALUES (1); -- the next insert won't be deduplicated because insert_deduplication_token is different INSERT INTO test_table SETTINGS insert_deduplication_token = 'test1' VALUES (1); -- the next insert will be deduplicated because insert_deduplication_token -- is the same as one of the previous INSERT INTO test_table SETTINGS insert_deduplication_token = 'test' VALUES (2); SELECT * FROM test_table ┌─A─┐ │ 1 │ └───┘ ┌─A─┐ │ 1 │ └───┘ ```
   */
  insert_deduplication_token?: string;

  /**
   * Approximate probability of failure for a keeper request during insert. Valid value is in interval [0.0f, 1.0f]
   */
  insert_keeper_fault_injection_probability?: number;

  /**
   * 0 - random seed, otherwise the setting value
   */
  insert_keeper_fault_injection_seed?: bigint;

  /**
   * The setting sets the maximum number of retries for ClickHouse Keeper (or ZooKeeper) requests during insert into replicated MergeTree. Only Keeper requests which failed due to network error, Keeper session timeout, or request timeout are considered for retries. Possible values: - Positive integer. - 0 — Retries are disabled Keeper request retries are done after some timeout. The timeout is controlled by the following settings: `insert_keeper_retry_initial_backoff_ms`, `insert_keeper_retry_max_backoff_ms`. The first retry is done after `insert_keeper_retry_initial_backoff_ms` timeout. The consequent timeouts will be calculated as follows: ``` timeout = min(insert_keeper_retry_max_backoff_ms, latest_timeout * 2) ``` For example, if `insert_keeper_retry_initial_backoff_ms=100`, `insert_keeper_retry_max_backoff_ms=10000` and `insert_keeper_max_retries=8` then timeouts will be `100, 200, 400, 800, 1600, 3200, 6400, 10000`. Apart from fault tolerance, the retries aim to provide a better user experience - they allow to avoid returning an error during INSERT execution if Keeper is restarted, for example, due to an upgrade.
   */
  insert_keeper_max_retries?: bigint;

  /**
   * Initial timeout(in milliseconds) to retry a failed Keeper request during INSERT query execution Possible values: - Positive integer. - 0 — No timeout
   */
  insert_keeper_retry_initial_backoff_ms?: bigint;

  /**
   * Maximum timeout (in milliseconds) to retry a failed Keeper request during INSERT query execution Possible values: - Positive integer. - 0 — Maximum timeout is not limited
   */
  insert_keeper_retry_max_backoff_ms?: bigint;

  /**
   * Enables or disables the insertion of [default values](/reference/statements/create/table#default_values) instead of [NULL](/reference/syntax#null) into columns with not [nullable](/reference/data-types/nullable) data type. If column type is not nullable and this setting is disabled, then inserting `NULL` causes an exception. If column type is nullable, then `NULL` values are inserted as is, regardless of this setting. This setting is applicable to [INSERT ... SELECT](/reference/statements/insert-into#inserting-the-results-of-select) queries. Note that `SELECT` subqueries may be concatenated with `UNION ALL` clause. Possible values: - 0 — Inserting `NULL` into a not nullable column causes an exception. - 1 — Default column value is inserted instead of `NULL`.
   */
  insert_null_as_default?: boolean;

  /**
   * <Note> This setting is not applicable to SharedMergeTree, see [SharedMergeTree consistency](/products/cloud/features/infrastructure/shared-merge-tree#consistency) for more information. </Note> Enables the quorum writes. - If `insert_quorum < 2`, the quorum writes are disabled. - If `insert_quorum >= 2`, the quorum writes are enabled. - If `insert_quorum = 'auto'`, use majority number (`number_of_replicas / 2 + 1`) as quorum number. Quorum writes `INSERT` succeeds only when ClickHouse manages to correctly write data to the `insert_quorum` of replicas during the `insert_quorum_timeout`. If for any reason the number of replicas with successful writes does not reach the `insert_quorum`, the write is considered failed and ClickHouse will delete the inserted block from all the replicas where data has already been written. When `insert_quorum_parallel` is disabled, all replicas in the quorum are consistent, i.e. they contain data from all previous `INSERT` queries (the `INSERT` sequence is linearized). When reading data written using `insert_quorum` and `insert_quorum_parallel` is disabled, you can turn on sequential consistency for `SELECT` queries using [select_sequential_consistency](#select_sequential_consistency). ClickHouse generates an exception: - If the number of available replicas at the time of the query is less than the `insert_quorum`. - When `insert_quorum_parallel` is disabled and an attempt to write data is made when the previous block has not yet been inserted in `insert_quorum` of replicas. This situation may occur if the user tries to perform another `INSERT` query to the same table before the previous one with `insert_quorum` is completed. See also: - [insert_quorum_timeout](#insert_quorum_timeout) - [insert_quorum_parallel](#insert_quorum_parallel) - [select_sequential_consistency](#select_sequential_consistency)
   */
  insert_quorum?: string;

  /**
   * <Note> This setting is not applicable to SharedMergeTree, see [SharedMergeTree consistency](/products/cloud/features/infrastructure/shared-merge-tree#consistency) for more information. </Note> Enables or disables parallelism for quorum `INSERT` queries. If enabled, additional `INSERT` queries can be sent while previous queries have not yet finished. If disabled, additional writes to the same table will be rejected. Possible values: - 0 — Disabled. - 1 — Enabled. See also: - [insert_quorum](#insert_quorum) - [insert_quorum_timeout](#insert_quorum_timeout) - [select_sequential_consistency](#select_sequential_consistency)
   */
  insert_quorum_parallel?: boolean;

  /**
   * Write to a quorum timeout in milliseconds. If the timeout has passed and no write has taken place yet, ClickHouse will generate an exception and the client must repeat the query to write the same block to the same or any other replica. See also: - [insert_quorum](#insert_quorum) - [insert_quorum_parallel](#insert_quorum_parallel) - [select_sequential_consistency](#select_sequential_consistency)
   */
  insert_quorum_timeout?: number;

  /**
   * If not `0`, specifies the shard of [Distributed](/reference/engines/table-engines/special/distributed) table into which the data will be inserted synchronously. If `insert_shard_id` value is incorrect, the server will throw an exception. To get the number of shards on `requested_cluster`, you can check server config or use this query: ```sql SELECT uniq(shard_num) FROM system.clusters WHERE cluster = 'requested_cluster'; ``` Possible values: - 0 — Disabled. - Any number from `1` to `shards_num` of corresponding [Distributed](/reference/engines/table-engines/special/distributed) table. **Example** Query: ```sql CREATE TABLE x AS system.numbers ENGINE = MergeTree ORDER BY number; CREATE TABLE x_dist AS x ENGINE = Distributed('test_cluster_two_shards_localhost', currentDatabase(), x); INSERT INTO x_dist SELECT * FROM numbers(5) SETTINGS insert_shard_id = 1; SELECT * FROM x_dist ORDER BY number ASC; ``` Result: ```text ┌─number─┐ │ 0 │ │ 0 │ │ 1 │ │ 1 │ │ 2 │ │ 2 │ │ 3 │ │ 3 │ │ 4 │ │ 4 │ └────────┘ ```
   */
  insert_shard_id?: bigint;

  /**
   * The interval in microseconds for checking whether request execution has been canceled and sending the progress.
   */
  interactive_delay?: bigint;

  /**
   * Set default mode in INTERSECT query. Possible values: empty string, 'ALL', 'DISTINCT'. If empty, query without mode will throw exception.
   */
  intersect_default_mode?: "ALL" | "DISTINCT";

  /**
   * Collect jemalloc allocation and deallocation samples in trace log.
   * @since 25.10
   */
  jemalloc_collect_profile_samples_in_trace_log?: boolean;

  /**
   * Enable jemalloc profiler for the query. Jemalloc will sample allocations and all deallocations for sampled allocations. Profiles can be flushed using SYSTEM JEMALLOC FLUSH PROFILE which can be used for allocation analysis. Samples can also be stored in system.trace_log using config jemalloc_collect_global_profile_samples_in_trace_log or with query setting jemalloc_collect_profile_samples_in_trace_log. See [Allocation Profiling](/concepts/features/performance/allocation-profiling)
   * @since 25.10
   */
  jemalloc_enable_profiler?: boolean;

  /**
   * When using the 'collapsed' output format for jemalloc heap profile, aggregate by allocation count instead of bytes. When false (default), each stack is weighted by live bytes; when true, by live allocation count.
   * @since 26.3
   */
  jemalloc_profile_text_collapsed_use_count?: boolean;

  /**
   * Output format for jemalloc heap profile in system.jemalloc_profile_text table. Can be: 'raw' (raw profile), 'symbolized' (jeprof format with symbols), or 'collapsed' (FlameGraph format).
   * @since 26.3
   */
  jemalloc_profile_text_output_format?: "raw" | "symbolized" | "collapsed";

  /**
   * Whether to include inline frames when symbolizing jemalloc heap profile. When enabled, inline frames are included which can slow down symbolization process drastically; when disabled, they are skipped. Only affects 'symbolized' and 'collapsed' output formats.
   * @since 26.3
   */
  jemalloc_profile_text_symbolize_with_inline?: boolean;

  /**
   * Changes the behaviour of join operations with `ANY` strictness when the right table has more than one matching row for a key. <Note> This setting applies to [`Join`](/reference/engines/table-engines/special/join) engine tables and hash-based join algorithms. It has no effect on a [block nested loop join](/reference/statements/select/join#join-with-an-arbitrary-on-condition): with no join key there is no group of matching rows to take the last one of. If a join is built in parallel, the order of rows can be non-deterministic. This means that `join_any_take_last_row = 1` can return a non-deterministic row for `ANY JOIN` queries. </Note> Possible values: - 0 — If the right table has more than one matching row, only the first one found is joined. - 1 — If the right table has more than one matching row, only the last one found is joined. See also: - [JOIN clause](/reference/statements/select/join) - [Join table engine](/reference/engines/table-engines/special/join) - [join_default_strictness](#join_default_strictness)
   */
  join_any_take_last_row?: boolean;

  /**
   * Sets default strictness for [JOIN clauses](/reference/statements/select/join). Possible values: - `ALL` — If the right table has several matching rows, ClickHouse creates a [Cartesian product](https://en.wikipedia.org/wiki/Cartesian_product) from matching rows. This is the normal `JOIN` behaviour from standard SQL. - `ANY` — If the right table has several matching rows, only the first one found is joined. If the right table has only one matching row, the results of `ANY` and `ALL` are the same. - `ASOF` — For joining sequences with an uncertain match. - `Empty string` — If `ALL` or `ANY` is not specified in the query, ClickHouse throws an exception.
   */
  join_default_strictness?: "ALL" | "ANY";

  /**
   * Limits the number of files allowed for parallel sorting in MergeJoin operations when they are executed on disk. The bigger the value of the setting, the more RAM is used and the less disk I/O is needed. Possible values: - Any positive integer, starting from 2.
   */
  join_on_disk_max_files_to_merge?: bigint;

  /**
   * The lower limit of per-key average rows in the right table to determine whether to output by row list in hash join.
   */
  join_output_by_rowlist_perkey_rows_threshold?: bigint;

  /**
   * Defines what action ClickHouse performs when a join reaches any of the following limits: - [max_bytes_in_join](/reference/settings/session-settings/max-bytes#max_bytes_in_join) - [max_rows_in_join](/reference/settings/session-settings/max-rows#max_rows_in_join) Every hash-based [`join_algorithm`](/reference/settings/session-settings/join#join_algorithm) value honors this setting, including the ones that spill to disk: reaching the limit stops the query rather than triggering a spill. The exception is `legacy_join_size_limits_trigger_spilling`: with it on, the part of a join that already runs on disk spills further instead of acting on this setting. `ie_join` honors it as well, on the input it accumulates from both sides. `partial_merge` still handles the limits by switching strategy — see [`join_algorithm`](/reference/settings/session-settings/join#join_algorithm). Possible values: - `THROW` — ClickHouse throws an exception and stops the query. - `BREAK` — ClickHouse stops the query and does not throw an exception. Default value: `THROW`. **See Also** - [JOIN clause](/reference/statements/select/join) - [Join table engine](/reference/engines/table-engines/special/join)
   */
  join_overflow_mode?: "throw" | "break";

  /**
   * Size in bytes of a bloom filter used as JOIN runtime filter (see enable_join_runtime_filters setting).
   * @since 25.11
   */
  join_runtime_bloom_filter_bytes?: bigint;

  /**
   * Number of hash functions in a bloom filter used as JOIN runtime filter (see enable_join_runtime_filters setting).
   * @since 25.11
   */
  join_runtime_bloom_filter_hash_functions?: bigint;

  /**
   * If the number of set bits in a runtime bloom filter exceeds this ratio the filter is completely disabled to reduce the overhead.
   * @since 26.2
   */
  join_runtime_bloom_filter_max_ratio_of_set_bits?: number;

  /**
   * Number of blocks that are skipped before trying to dynamically re-enable a runtime filter that previously was disabled due to poor filtering ratio.
   * @since 26.2
   */
  join_runtime_filter_blocks_to_skip_before_reenabling?: bigint;

  /**
   * Maximum number of elements in runtime filter that are stored as is in a set, when this threshold is exceeded it switches to bloom filter.
   * @since 25.11
   */
  join_runtime_filter_exact_values_limit?: bigint;

  /**
   * When the hash join build side was converted to a FixedHashMap (see `enable_join_fixed_hash_table_conversion`), use that hash map directly as the runtime filter.
   * @since 26.7
   */
  join_runtime_filter_from_fixed_hash_table?: boolean;

  /**
   * If, at query planning time, the probe side of a JOIN is estimated to produce no more than this number of rows, the JOIN runtime filter is not created. Building and applying a runtime filter for a tiny probe side costs more than it saves. Set to 0 to always create the runtime filter regardless of the estimated probe size.
   * @since 26.9
   */
  join_runtime_filter_min_probe_rows?: bigint;

  /**
   * If ratio of passed rows to checked rows is greater than this threshold the runtime filter is considered as poorly performing and is disabled for the next `join_runtime_filter_blocks_to_skip_before_reenabling` blocks to reduce the overhead.
   * @since 26.2
   */
  join_runtime_filter_pass_ratio_threshold_for_disabling?: number;

  /**
   * Use hash table size statistics collected from previous executions to size the JOIN runtime filter. When disabled, fall back to the fixed `join_runtime_bloom_filter_bytes`.
   * @since 26.8
   */
  join_runtime_filter_size_from_hash_table_stats?: boolean;

  /**
   * The maximum number of rows in the right table to determine whether to rerange the right table by key in left or inner join.
   */
  join_to_sort_maximum_table_rows?: bigint;

  /**
   * The lower limit of per-key average rows in the right table to determine whether to rerange the right table by key in left or inner join. This setting ensures that the optimization is not applied for sparse table keys
   */
  join_to_sort_minimum_perkey_rows?: bigint;

  /**
   * Sets the type of [JOIN](/reference/statements/select/join) behaviour. When merging tables, empty cells may appear. ClickHouse fills them differently based on this setting. Possible values: - 0 — The empty cells are filled with the default value of the corresponding field type. - 1 — `JOIN` behaves the same way as in standard SQL. The type of the corresponding field is converted to [Nullable](/reference/data-types/nullable), and empty cells are filled with [NULL](/reference/syntax).
   */
  join_use_nulls?: boolean;

  /**
   * Allow to chunk hash join result by rows corresponding to single row from left table. This may reduce memory usage in case of row with many matches in right table, but may increase CPU usage. Note that `max_joined_block_size_rows != 0` is mandatory for this setting to have effect. The `max_joined_block_size_bytes` combined with this setting is helpful to avoid excessive memory usage in case of skewed data with some large rows having many matches in right table.
   * @since 25.11
   */
  joined_block_split_single_row?: boolean;

  /**
   * Force joined subqueries and table functions to have aliases for correct name qualification.
   */
  joined_subquery_requires_alias?: boolean;

  /**
   * Fill named tuples from JSON objects only, in the `JSONExtract` family of functions. When disabled, a JSON array fills a named tuple positionally (the historical behavior), so which array element lands in which named field depends on the tuple's declaration order. Unnamed tuples always fill positionally from arrays regardless of this setting. This setting applies to JSON passed as a string. Extraction from a column of the `JSON` data type is not affected, for typed and untyped paths alike: it reads the column's subcolumns instead of parsing a JSON document, so it never reaches the code this setting governs. Named tuple *columns* in JSON input formats are governed by the separate [input_format_json_named_tuples_as_objects](/reference/settings/formats/input-format#input_format_json_named_tuples_as_objects) setting; this setting covers the extraction functions only. Disabled by default.
   * @since 26.11
   */
  json_extract_named_tuples_as_objects?: boolean;

  /**
   * Disable limit on kafka_num_consumers that depends on the number of available CPU cores.
   */
  kafka_disable_num_consumers_limit?: boolean;

  /**
   * The wait time in milliseconds for reading messages from [Kafka](/reference/engines/table-engines/integrations/kafka) before retry. Possible values: - Positive integer. - 0 — Infinite timeout. See also: - [Apache Kafka](https://kafka.apache.org/)
   */
  kafka_max_wait_ms?: number;

  /**
   * Enforce additional checks during operations on KeeperMap. E.g. throw an exception on an insert for already existing key
   */
  keeper_map_strict_mode?: boolean;

  /**
   * Max retries for general keeper operations
   */
  keeper_max_retries?: bigint;

  /**
   * Initial backoff timeout for general keeper operations
   */
  keeper_retry_initial_backoff_ms?: bigint;

  /**
   * Max backoff timeout for general keeper operations
   */
  keeper_retry_max_backoff_ms?: bigint;

  /**
   * Controls whether [`KILL QUERY`](/sql-reference/statements/kill#kill-query) and [`KILL MUTATION`](/sql-reference/statements/kill#kill-mutation) throw an exception when their `WHERE` clauses match no rows. If set to true, `KILL QUERY` throws when there are no eligible rows in `system.processes` after excluding the current `KILL` statement, and `KILL MUTATION` throws when no rows match in `system.mutations`. By default, an empty match returns without an exception. `ON CLUSTER` execution does not throw for empty matches because match results are not aggregated across hosts. Possible values: - 1 — Throw an exception. - 0 — Do not throw an exception.
   * @since 26.11
   */
  kill_throw_if_noop?: boolean;

  /**
   * If enabled, functions 'least' and 'greatest' return NULL if one of their arguments is NULL.
   * @since 25.2
   */
  least_greatest_legacy_null_behavior?: boolean;

  /**
   * How non-deterministic and block-dependent functions next to the `arrayJoin` function are evaluated. By default `rand()` gives a different value on every output row and `runningDifference` or `neighbor` see the blocks of the expansion, like with the `ARRAY JOIN` clause. Enable to get the behavior of older versions.
   * @since 26.11
   */
  legacy_array_join_function_nondeterministic_evaluation?: boolean;

  /**
   * List all names of element of large tuple literals in their column names instead of hash. This settings exists only for compatibility reasons. It makes sense to set to 'true', while doing rolling update of cluster from version lower than 21.7 to higher.
   */
  legacy_column_name_of_tuple_literal?: boolean;

  /**
   * Restores how `max_rows_in_join` and `max_bytes_in_join` worked before the spill threshold became the trigger, for the part of a join that runs on disk: reaching one of them makes the join spill further instead of stopping the query. `join_algorithm = 'grace_hash'` then spills on those two alone and ignores `max_bytes_before_external_join` entirely, zero included. `hash` / `parallel_hash` still go to disk on the spill threshold and spill on either one afterwards; their in-memory phase keeps treating the two as a hard cap, as it did before. For queries written against the earlier meaning of these two settings; `compatibility` enables it automatically. A server that predates this setting applies the old meaning, and cannot be told otherwise, so with `serialize_query_plan = 1` a join whose spilling depends on the new meaning is not sent to such a server at all: the query fails instead of quietly running with the other contract. Turning this setting on makes those queries work across the two versions, with the old meaning on both sides.
   * @since 26.11
   */
  legacy_join_size_limits_trigger_spilling?: boolean;

  /**
   * A mode of internal update query that is executed as a part of lightweight delete. Possible values: - `alter_update` - run `ALTER UPDATE` query that creates a heavyweight mutation. - `lightweight_update` - run lightweight update if possible, run `ALTER UPDATE` otherwise. - `lightweight_update_force` - run lightweight update if possible, throw otherwise. For `DELETE FROM ... ON CLUSTER`, each executing host derives the mode from its own settings, so hosts whose profiles set different defaults can run the delete in different modes. A replicated shard executes on one replica, so there it is that replica's settings that decide. Setting it in the session of the initiating query overrides this, because the distributed DDL entry carries session changes at `distributed_ddl_entry_format_version` 2 and above, which the default satisfies. A host that constrains the setting clamps the value back.
   * @since 25.6
   */
  lightweight_delete_mode?: "alter_update" | "lightweight_update" | "lightweight_update_force";

  /**
   * The same as [`mutations_sync`](#mutations_sync), but controls only execution of lightweight deletes. Possible values: | Value | Description | |-------|-------------------------------------------------------------------------------------------------------------------------------------------------------| | `0` | Mutations execute asynchronously. | | `1` | The query waits for the lightweight deletes to complete on the current server. | | `2` | The query waits for the lightweight deletes to complete on all replicas (if they exist). | | `3` | The query waits only for the active replicas. Inactive replicas apply the lightweight deletes when they become active. | **See Also** - [Synchronicity of ALTER Queries](/reference/statements/alter/index#synchronicity-of-alter-queries) - [Mutations](/reference/statements/alter/index#mutations) Cloud default value: `1`.
   */
  lightweight_deletes_sync?: bigint;

  /**
   * Sets the maximum number of rows to get from the query result. It adjusts the value set by the [LIMIT](/reference/statements/select/limit) clause. The value is passed through to `LIMIT` and accepts everything that `LIMIT` accepts, including negative values (count from the end of the result) and fractions in `(0, 1)` (interpreted as a share of the result). Possible values: - 0 — The number of rows is not limited. - Positive integer — exact number of rows. - Negative integer — return the last N rows. - A real number in the open range `(0, 1)` — return that fraction of the result. This setting shapes result-producing `SELECT` / `UNION` queries. For a write query (`INSERT … SELECT`, `CREATE … AS SELECT`) it takes effect only when the source `SELECT` carries it in its own `SETTINGS` clause; a value inherited from a profile or session, or set on the `INSERT` / `CREATE` statement itself, does not propagate into the source `SELECT` — the same non-propagation rule that applies to any other setting.
   */
  limit?: number;

  /**
   * Specifies the algorithm of replicas selection that is used for distributed query processing. ClickHouse supports the following algorithms of choosing replicas: - [Random](#load_balancing-random) (by default) - [Nearest hostname](#load_balancing-nearest_hostname) - [Hostname levenshtein distance](#load_balancing-hostname_levenshtein_distance) - [Hostname longest common prefix](#load_balancing-hostname_longest_common_prefix) - [Hostname longest common suffix](#load_balancing-hostname_longest_common_suffix) - [In order](#load_balancing-in_order) - [First or random](#load_balancing-first_or_random) - [Round robin](#load_balancing-round_robin) See also: - [distributed_replica_max_ignored_errors](#distributed_replica_max_ignored_errors) ### Random (by Default) {#load_balancing-random} ```sql load_balancing = random ``` The number of errors is counted for each replica. The query is sent to the replica with the fewest errors, and if there are several of these, to anyone of them. Disadvantages: Server proximity is not accounted for; if the replicas have different data, you will also get different data. ### Nearest Hostname {#load_balancing-nearest_hostname} ```sql load_balancing = nearest_hostname ``` The number of errors is counted for each replica. Every 5 minutes, the number of errors is integrally divided by 2. Thus, the number of errors is calculated for a recent time with exponential smoothing. If there is one replica with a minimal number of errors (i.e. errors occurred recently on the other replicas), the query is sent to it. If there are multiple replicas with the same minimal number of errors, the query is sent to the replica with a hostname that is most similar to the server's hostname in the config file (for the number of different characters in identical positions, up to the minimum length of both hostnames). For instance, example01-01-1 and example01-01-2 are different in one position, while example01-01-1 and example01-02-2 differ in two places. This method might seem primitive, but it does not require external data about network topology, and it does not compare IP addresses, which would be complicated for our IPv6 addresses. Thus, if there are equivalent replicas, the closest one by name is preferred. We can also assume that when sending a query to the same server, in the absence of failures, a distributed query will also go to the same servers. So even if different data is placed on the replicas, the query will return mostly the same results. ### Hostname levenshtein distance {#load_balancing-hostname_levenshtein_distance} ```sql load_balancing = hostname_levenshtein_distance ``` Just like `nearest_hostname`, but it compares hostname in a [levenshtein distance](https://en.wikipedia.org/wiki/Levenshtein_distance) manner. For example: ```text example-clickhouse-0-0 ample-clickhouse-0-0 1 example-clickhouse-0-0 example-clickhouse-1-10 2 example-clickhouse-0-0 example-clickhouse-12-0 3 ``` ### Hostname longest common prefix {#load_balancing-hostname_longest_common_prefix} ```sql load_balancing = hostname_longest_common_prefix ``` Just like `nearest_hostname`, but the replica whose hostname shares the longest common prefix with the local hostname is preferred (the longer the common prefix, the higher the priority). Unlike `nearest_hostname`, which counts differing characters position by position, this strategy is not confused by hostnames whose numeric segments have different lengths. For example, for the local hostname `sfe301`: ```text sfe301 sde301 1 sfe301 sfe10101 3 sfe301 sde505 1 ``` Here `sfe10101` is preferred because it shares the longest common prefix (`sfe`, length 3) with `sfe301`. Replicas with equal common prefix length are chosen at random. In particular, when no replica shares any prefix with the local hostname (all common prefix lengths are zero), this strategy behaves exactly like `random`. ### Hostname longest common suffix {#load_balancing-hostname_longest_common_suffix} ```sql load_balancing = hostname_longest_common_suffix ``` Just like `hostname_longest_common_prefix`, but the longest common *suffix* is compared instead of the prefix. This is useful when the data center identity is encoded as a suffix of the hostname. For example, for the local hostname `et46gtghn.qc.localdomain`: ```text et46gtghn.qc.localdomain tr676ddgh.td.localdomain 12 et46gtghn.qc.localdomain ab999.qc.localdomain 15 ``` Here `ab999.qc.localdomain` is preferred because it shares the longest common suffix (`.qc.localdomain`, length 15) with `et46gtghn.qc.localdomain`. Replicas with equal common suffix length are chosen at random. In particular, when no replica shares any suffix with the local hostname (all common suffix lengths are zero), this strategy behaves exactly like `random`. ### In Order {#load_balancing-in_order} ```sql load_balancing = in_order ``` Replicas with the same number of errors are accessed in the same order as they are specified in the configuration. This method is appropriate when you know exactly which replica is preferable. ### First or Random {#load_balancing-first_or_random} ```sql load_balancing = first_or_random ``` This algorithm chooses the first replica in the set or a random replica if the first is unavailable. It's effective in cross-replication topology setups, but useless in other configurations. The `first_or_random` algorithm solves the problem of the `in_order` algorithm. With `in_order`, if one replica goes down, the next one gets a double load while the remaining replicas handle the usual amount of traffic. When using the `first_or_random` algorithm, the load is evenly distributed among replicas that are still available. It's possible to explicitly define what the first replica is by using the setting `load_balancing_first_offset`. This gives more control to rebalance query workloads among replicas. ### Round Robin {#load_balancing-round_robin} ```sql load_balancing = round_robin ``` This algorithm uses a round-robin policy across replicas with the same number of errors (only the queries with `round_robin` policy is accounted).
   */
  load_balancing?:
    | "random"
    | "nearest_hostname"
    | "hostname_levenshtein_distance"
    | "hostname_longest_common_prefix"
    | "hostname_longest_common_suffix"
    | "in_order"
    | "first_or_random"
    | "round_robin";

  /**
   * Which replica to preferably send a query when FIRST_OR_RANDOM load balancing strategy is used.
   */
  load_balancing_first_offset?: bigint;

  /**
   * Load MergeTree marks asynchronously in a background thread pool (see the server setting `load_marks_threadpool_pool_size`), so that the marks of all streams are loaded in parallel. Otherwise, marks are loaded synchronously, one stream after another, which is slow on remote disks for columns with many substreams, such as `JSON`.
   */
  load_marks_asynchronously?: boolean;

  /**
   * Method of reading data from local filesystem, one of: read, pread, mmap, io_uring, pread_threadpool. The 'pread_threadpool' method hands a read off to a thread pool, unless the data is already in the page cache, which is checked with the `preadv2` system call and the `RWF_NOWAIT` flag. That check needs Linux 5.11 or newer, and the system call must not be rejected by a `seccomp` profile of a container runtime. It is checked on startup whether the system call can be used, and if it cannot, the default value of this setting is switched to 'pread', because a thread pool hand-off for every read, including the reads that are served from the page cache, is expensive; the reason is reported in the server log. A `seccomp` profile is detected only if it rejects the system call with an error code, which is what container runtimes do; a profile that terminates the process instead cannot be detected. A value set explicitly, in the configuration or with `SET`, is not switched. The 'io_uring' method is experimental and does not work for Log, TinyLog, StripeLog, File, Set and Join, and other tables with append-able files in presence of concurrent reads and writes. If you read various articles about 'io_uring' on the Internet, don't be blinded by them. It is not a better method of reading files, unless the case of a large amount of small IO requests, which is not the case in ClickHouse. There are no reasons to enable 'io_uring'.
   */
  local_filesystem_read_method?: string;

  /**
   * Should use prefetching when reading data from local filesystem.
   */
  local_filesystem_read_prefetch?: boolean;

  /**
   * Defines how many seconds a locking request waits before failing. Locking timeout is used to protect from deadlocks while executing read/write operations with tables. When the timeout expires and the locking request fails, the ClickHouse server throws an exception "Locking attempt timed out! Possible deadlock avoided. Client should retry." with error code `DEADLOCK_AVOIDED`. Possible values: - Positive integer (in seconds). - 0 — No locking timeout.
   */
  lock_acquire_timeout?: number;

  /**
   * Specifies the value for the `log_comment` field of the [system.query_log](/reference/system-tables/query_log) table and comment text for the server log. It can be used to improve the readability of server logs. Additionally, it helps to select queries related to the test from the `system.query_log` after running [clickhouse-test](/resources/develop-contribute/contribute/tests). Possible values: - Any string no longer than [max_query_size](#max_query_size). If the max_query_size is exceeded, the server throws an exception. **Example** Query: ```sql SET log_comment = 'log_comment test', log_queries = 1; SELECT 1; SYSTEM FLUSH LOGS; SELECT type, query FROM system.query_log WHERE log_comment = 'log_comment test' AND event_date >= yesterday() ORDER BY event_time DESC LIMIT 2; ``` Result: ```text ┌─type────────┬─query─────┐ │ QueryStart │ SELECT 1; │ │ QueryFinish │ SELECT 1; │ └─────────────┴───────────┘ ```
   */
  log_comment?: string;

  /**
   * Allows to log formatted queries to the [system.query_log](/reference/system-tables/query_log) system table (populates `formatted_query` column in the [system.query_log](/reference/system-tables/query_log)). Possible values: - 0 — Formatted queries are not logged in the system table. - 1 — Formatted queries are logged in the system table.
   */
  log_formatted_queries?: boolean;

  /**
   * Write time that processor spent during execution/waiting for data to `system.processors_profile_log` table. See also: - [`system.processors_profile_log`](/reference/system-tables/processors_profile_log) - [`EXPLAIN PIPELINE`](/reference/statements/explain#explain-pipeline)
   */
  log_processors_profiles?: boolean;

  /**
   * Log query performance statistics into the query_log, query_thread_log and query_views_log.
   */
  log_profile_events?: boolean;

  /**
   * Setting up query logging. Queries sent to ClickHouse with this setup are logged according to the rules in the [query_log](/reference/settings/server-settings/settings/query#query_log) server configuration parameter. Example: ```text log_queries=1 ```
   */
  log_queries?: boolean;

  /**
   * If query length is greater than a specified threshold (in bytes), then cut query when writing to query log. Also limit the length of printed query in ordinary text log.
   */
  log_queries_cut_to_length?: bigint;

  /**
   * If enabled (non-zero), queries faster than the value of this setting will not be logged (you can think about this as a `long_query_time` for [MySQL Slow Query Log](https://dev.mysql.com/doc/refman/5.7/slow-query-log.html)), and this basically means that you will not find them in the following tables: - `system.query_log` - `system.query_thread_log` Only the queries with the following type will get to the log: - `QUERY_FINISH` - `EXCEPTION_WHILE_PROCESSING` - Type: milliseconds - Default value: 0 (any query)
   */
  log_queries_min_query_duration_ms?: number;

  /**
   * `query_log` minimal type to log. Possible values: - `QUERY_START` (`=1`) - `QUERY_FINISH` (`=2`) - `EXCEPTION_BEFORE_START` (`=3`) - `EXCEPTION_WHILE_PROCESSING` (`=4`) Can be used to limit which entities will go to `query_log`, say you are interested only in errors, then you can use `EXCEPTION_WHILE_PROCESSING`: ```text log_queries_min_type='EXCEPTION_WHILE_PROCESSING' ```
   */
  log_queries_min_type?: string;

  /**
   * Allows a user to write to [query_log](/reference/system-tables/query_log), [query_thread_log](/reference/system-tables/query_thread_log), and [query_views_log](/reference/system-tables/query_views_log) system tables only a sample of queries selected randomly with the specified probability. It helps to reduce the load with a large volume of queries in a second. Possible values: - 0 — Queries are not logged in the system tables. - Positive floating-point number in the range [0..1]. For example, if the setting value is `0.5`, about half of the queries are logged in the system tables. - 1 — All queries are logged in the system tables.
   */
  log_queries_probability?: number;

  /**
   * Log query settings into the query_log and OpenTelemetry span log.
   */
  log_query_settings?: boolean;

  /**
   * Setting up query threads logging. Query threads log into the [system.query_thread_log](/reference/system-tables/query_thread_log) table. This setting has effect only when [log_queries](#log_queries) is true. Queries' threads run by ClickHouse with this setup are logged according to the rules in the [query_thread_log](/reference/settings/server-settings/settings/query#query_thread_log) server configuration parameter. Possible values: - 0 — Disabled. - 1 — Enabled. **Example** ```text log_query_threads=1 ```
   */
  log_query_threads?: boolean;

  /**
   * Setting up query views logging. When a query run by ClickHouse with this setting enabled has associated views (materialized or live views), they are logged in the [query_views_log](/reference/settings/server-settings/settings/query#query_views_log) server configuration parameter. Example: ```text log_query_views=1 ```
   */
  log_query_views?: boolean;

  /**
   * Specifies the database with the logs table used by the 'logsql' dialect. Empty string means the current database.
   * @since 26.11
   */
  logsql_database?: string;

  /**
   * Specifies the name of the column referred to by the `_msg` field (the default field of LogsQL filters) in the 'logsql' dialect.
   * @since 26.11
   */
  logsql_message_column?: string;

  /**
   * Specifies the name of the logs table used by the 'logsql' dialect.
   * @since 26.11
   */
  logsql_table?: string;

  /**
   * Specifies the name of the column referred to by the `_time` field in the 'logsql' dialect.
   * @since 26.11
   */
  logsql_time_column?: string;

  /**
   * Allows or restricts using the [LowCardinality](/reference/data-types/lowcardinality) data type with the [Native](/reference/formats/Native) format. If usage of `LowCardinality` is restricted, ClickHouse server converts `LowCardinality`-columns to ordinary ones for `SELECT` queries, and convert ordinary columns to `LowCardinality`-columns for `INSERT` queries. This setting is required mainly for third-party clients which do not support `LowCardinality` data type. Possible values: - 1 — Usage of `LowCardinality` is not restricted. - 0 — Usage of `LowCardinality` is restricted.
   */
  low_cardinality_allow_in_native_format?: boolean;

  /**
   * Sets a maximum size in rows of a shared global dictionary for the [LowCardinality](/reference/data-types/lowcardinality) data type that can be written to a storage file system. This setting prevents issues with RAM in case of unlimited dictionary growth. All the data that can't be encoded due to maximum dictionary size limitation ClickHouse writes in an ordinary method. Possible values: - Any positive integer.
   */
  low_cardinality_max_dictionary_size?: bigint;

  /**
   * Turns on or turns off using of single dictionary for the data part. By default, the ClickHouse server monitors the size of dictionaries and if a dictionary overflows then the server starts to write the next one. To prohibit creating several dictionaries set `low_cardinality_use_single_dictionary_for_part = 1`. Possible values: - 1 — Creating several dictionaries for the data part is prohibited. - 0 — Creating several dictionaries for the data part is not prohibited.
   */
  low_cardinality_use_single_dictionary_for_part?: boolean;

  /**
   * When the query prioritization mechanism is employed (see setting `priority`), low-priority queries wait for higher-priority queries to finish. This setting specifies the duration of waiting.
   * @since 25.5
   */
  low_priority_query_wait_time_ms?: number;

  /**
   * Make distributed query plan. Enabling it automatically adjusts settings that control features not supported by distributed query plans yet: - `enable_parallel_replicas = 0` and `automatic_parallel_replicas_mode = 0` — the distributed plan does its own work distribution; - `correlated_subqueries_use_in_memory_buffer = 0`; - `compile_expressions = 0`; - `query_plan_direct_read_from_text_index = 0`.
   * @since 25.6
   */
  make_distributed_plan?: boolean;

  /**
   * If INSERTs build and store skip indexes. If disabled, skip indexes will only be built and stored [during merges](/reference/settings/merge-tree-settings/materialize#materialize_skip_indexes_on_merge) or by explicit [MATERIALIZE INDEX](/reference/statements/alter/skipping-index#materialize-index). See also [exclude_materialize_skip_indexes_on_insert](#exclude_materialize_skip_indexes_on_insert).
   */
  materialize_skip_indexes_on_insert?: boolean;

  /**
   * If statistics are build and materialized for newly inserted parts. Even if disabled, statistics are still be build and stored during merges or by explicit MATERIALIZE STATISTICS. Only tables whose current size plus the size of the block being written, does not exceed `materialize_statistics_on_insert_max_table_size` are affected.
   */
  materialize_statistics_on_insert?: boolean;

  /**
   * Only build and store column statistics for newly inserted parts (see `materialize_statistics_on_insert`) for tables whose current size plus the block being written, does not exceed this value. `0` means no size limit.
   * @since 26.9
   */
  materialize_statistics_on_insert_max_table_size?: bigint;

  /**
   * Apply TTL for old data, after ALTER MODIFY TTL query
   */
  materialize_ttl_after_modify?: boolean;

  /**
   * If enabled, exceptions thrown while pushing data to a dependent materialized view (in its `SELECT` or in the inner table sink) are logged as a warning and the `INSERT` statement succeeds. If disabled (default), such an exception propagates and the `INSERT` statement fails. This setting controls only error reporting. It does not roll back a write to the source table, and it does not guarantee whether the original block has already been committed to the source table when an error occurs in a dependent view's pipeline. When disabled (default), the `INSERT` fails on a view error — retry it with insert deduplication (`insert_deduplicate`, `deduplicate_blocks_in_dependent_materialized_views`) for exactly-once delivery to the source table and all dependent views. When enabled, the `INSERT` reports success despite partial delivery to failing views and their downstream chains; use this only when source-table writes must not be blocked by view-side problems (for example, `system.*_log` tables). See the `CREATE VIEW` docs for full semantics.
   */
  materialized_views_ignore_errors?: boolean;

  /**
   * Make `CREATE MATERIALIZED VIEW ... POPULATE` atomic: the view is subscribed to new inserts of the source table and a snapshot of the existing data is taken together, under a brief exclusive lock on the source table, so that every row inserted concurrently with the population is delivered to the view exactly once (neither missed nor duplicated). The (possibly long-running) population then reads the pinned snapshot without holding any lock. This is local insert-path atomicity: the exclusive lock only serializes with inserts that acquire this source table's storage lock on the same server, so the exactly-once guarantee covers inserts arriving through this server. It is not a cluster-wide guarantee - rows inserted on another replica of a `ReplicatedMergeTree` source, or through a distributed write path (for example, into a `Distributed` table or via `ON CLUSTER`), concurrently with the population can still be missed or duplicated. This requires the source table to support reading a pinned point-in-time snapshot (the `MergeTree` family and `Memory`). For any other source (a view, `Distributed`, `Merge`, the `Log` family, or a table not in an `Atomic` database) the population falls back to the legacy, non-atomic behavior (recorded in the server log): existing data is read with a separate, non-coordinated snapshot, so rows inserted during the population can be missed or duplicated. Set this setting to `false` to force the legacy behavior for all sources. Applies to plain `CREATE MATERIALIZED VIEW` only; `CREATE OR REPLACE` / `REPLACE` always use the legacy non-atomic population, and so does a view created in a `Replicated` database (where `POPULATE` requires `database_replicated_allow_heavy_create`), because a failed population could not be rolled back consistently on all replicas there.
   * @since 26.9
   */
  materialized_views_populate_atomically?: boolean;

  /**
   * Squash inserts to materialized views destination table of a single INSERT query from parallel inserts to reduce amount of generated parts. If set to false and `parallel_view_processing` is enabled, INSERT query will generate part in the destination table for each `max_insert_thread`.
   * @since 25.11
   */
  materialized_views_squash_parallel_inserts?: boolean;

  /**
   * Maximum number of analyses performed by interpreter.
   */
  max_analyze_depth?: bigint;

  /**
   * The maximum nesting depth of a query syntactic tree. If exceeded, an exception is thrown. <Note> At this time, it isn't checked during parsing, but only after parsing the query. This means that a syntactic tree that is too deep can be created during parsing, but the query will fail. </Note>
   */
  max_ast_depth?: bigint;

  /**
   * The maximum number of elements in a query syntactic tree. If exceeded, an exception is thrown. <Note> At this time, it isn't checked during parsing, but only after parsing the query. This means that a syntactic tree that is too deep can be created during parsing, but the query will fail. </Note>
   */
  max_ast_elements?: bigint;

  /**
   * The limit on the number of series created by the `generateSerialID` function. As each series represents a node in Keeper, it is recommended to have no more than a couple of millions of them.
   * @since 25.2
   */
  max_autoincrement_series?: bigint;

  /**
   * The maximum read speed in bytes per second for particular backup on server. Zero means unlimited.
   */
  max_backup_bandwidth?: bigint;

  /**
   * In ClickHouse, data is processed by blocks, which are sets of column parts. The internal processing cycles for a single block are efficient but there are noticeable costs when processing each block. The `max_block_size` setting indicates the recommended maximum number of rows to include in a single block when loading data from tables. Blocks the size of `max_block_size` are not always loaded from the table: if ClickHouse determines that less data needs to be retrieved, a smaller block is processed. The block size should not be too small to avoid noticeable costs when processing each block. It should also not be too large to ensure that queries with a LIMIT clause execute quickly after processing the first block. When setting `max_block_size`, the goal should be to avoid consuming too much memory when extracting a large number of columns in multiple threads and to preserve at least some cache locality.
   */
  max_block_size?: bigint;

  /**
   * Query memory threshold, in bytes, for spilling `DISTINCT` data to disk. Actual memory usage can exceed this threshold. `0` disables this threshold. If `max_bytes_ratio_before_external_distinct` also provides a threshold, the smaller is used. Set both settings to `0` to disable spilling. See [DISTINCT in external memory](/sql-reference/statements/select/distinct#distinct-in-external-memory).
   * @since 26.11
   */
  max_bytes_before_external_distinct?: bigint;

  /**
   * Cloud default value: half the memory amount per replica. Enables or disables execution of `GROUP BY` clauses in external memory. (See [GROUP BY in external memory](/reference/statements/select/group-by#group-by-in-external-memory)) Possible values: - Maximum volume of RAM (in bytes) that can be used by the single [GROUP BY](/reference/statements/select/group-by) operation. - `0` — `GROUP BY` in external memory disabled. <Note> If memory usage during GROUP BY operations is exceeding this threshold in bytes, activate the 'external aggregation' mode (spill data to disk). The recommended value is half of the available system memory. </Note>
   */
  max_bytes_before_external_group_by?: bigint;

  /**
   * If set to a non-zero value and `join_algorithm` is `hash`, `parallel_hash`, `default`, or `auto`, the hash join will automatically be converted to grace hash join to enable spilling to disk when the right-side data exceeds this many bytes. Together with `max_bytes_ratio_before_external_join`, this is the threshold-based spill trigger for every hash-based `join_algorithm`, including `grace_hash`, which requires one of the two to be non-zero. Once a non-zero threshold makes a join spill-capable, `enable_adaptive_memory_spill_scheduler` can force it to spill under memory pressure before the threshold is reached. When set to `0` (default), this absolute byte threshold is disabled, but automatic spilling may still occur via `max_bytes_ratio_before_external_join` (which defaults to `0.5`). With both settings at `0`, the join never spills, so the scheduler has nothing to trigger. The exception is `legacy_join_size_limits_trigger_spilling`: with it on, standalone `grace_hash` ignores both settings and spills on `max_rows_in_join` / `max_bytes_in_join` instead. It prevents read in order through join optimization. The threshold also bounds the right side materialized by the [block nested loop join](/reference/statements/select/join#join-with-an-arbitrary-on-condition), whatever `join_algorithm` is set to.
   * @since 26.6
   */
  max_bytes_before_external_join?: bigint;

  /**
   * Query memory threshold, in bytes, for spilling the set of `IN` with a subquery to disk, while the set is being built or while the query uses it. Actual memory usage can exceed this threshold. A set that takes less memory than this threshold or 16 MiB, whichever is smaller, stays in memory. `0` disables this threshold. If `max_bytes_ratio_before_external_set` also provides a threshold, the smaller is used. Set both settings to `0` to disable spilling. See [IN in external memory](/reference/statements/in#in-in-external-memory).
   * @since 26.11
   */
  max_bytes_before_external_set?: bigint;

  /**
   * Cloud default value: half the memory amount per replica. Enables or disables execution of `ORDER BY` clauses in external memory. See [ORDER BY Implementation Details](/reference/statements/select/order-by#implementation-details) If memory usage during ORDER BY operation exceeds this threshold in bytes, the 'external sorting' mode (spill data to disk) is activated. Possible values: - Maximum volume of RAM (in bytes) that can be used by the single [ORDER BY](/reference/statements/select/order-by) operation. The recommended value is half of available system memory - `0` — `ORDER BY` in external memory disabled.
   */
  max_bytes_before_external_sort?: bigint;

  /**
   * In case of ORDER BY with LIMIT, when memory usage is higher than specified threshold, perform additional steps of merging blocks before final merge to keep just top LIMIT rows.
   */
  max_bytes_before_remerge_sort?: bigint;

  /**
   * Maximum number of bytes in the set for lazy FINAL optimization. If exceeded, falls back to normal FINAL.
   * @since 26.5
   */
  max_bytes_for_lazy_final?: bigint;

  /**
   * The maximum number of bytes of the state (in uncompressed bytes) in memory, which is used by a hash table when using DISTINCT.
   */
  max_bytes_in_distinct?: bigint;

  /**
   * The maximum size in bytes of the right-side data structure (typically a hash table) used when joining tables. This setting applies to [SELECT ... JOIN](/reference/statements/select/join) operations and the [Join table engine](/reference/engines/table-engines/special/join). If a query contains multiple joins, ClickHouse checks this setting for every intermediate result. It is a hard cap for every hash-based `join_algorithm`: when the limit is reached the query throws or breaks according to [`join_overflow_mode`](/reference/settings/session-settings/join#join_overflow_mode). It never makes a join spill to disk — that decision belongs to [`max_bytes_before_external_join`](#max_bytes_before_external_join) and [`max_bytes_ratio_before_external_join`](#max_bytes_ratio_before_external_join). Because it is a cap rather than a trigger, setting it at or below the spill threshold normally makes the query fail before the join can spill at all — unless the join is spill-capable and `enable_adaptive_memory_spill_scheduler` forces a spill first, or `legacy_join_size_limits_trigger_spilling` turns this limit back into a spill trigger for the part of a join that already runs on disk. The limit counts what the hash tables hold, so a join that spilled reaches it as each bucket is loaded rather than while the right side is read: it can read more of the right side before stopping than an in-memory hash join would. When an `ON` section determines no join key at all, there is no algorithm to choose: the limit applies to the right side materialized by the [block nested loop join](/reference/statements/select/join#join-with-an-arbitrary-on-condition), spilled blocks included, and the action on overflow is [`join_overflow_mode`](/reference/settings/session-settings/join#join_overflow_mode). Possible values: - Positive integer. - 0 — Memory control is disabled.
   */
  max_bytes_in_join?: bigint;

  /**
   * The maximum number of bytes (of uncompressed data) used by a set in the IN clause created from a subquery.
   */
  max_bytes_in_set?: bigint;

  /**
   * Fraction of available server or user memory used to calculate the external `DISTINCT` threshold at the start of execution. For example, `0.5` uses half of the available memory. Values must be at least `0` and less than `1`. `0` disables this threshold. Without an applicable server or user memory limit, the ratio has no effect. `max_memory_usage` does not affect this calculation. To configure spilling relative to that limit, use `max_bytes_before_external_distinct`, leaving room for additional memory usage.
   * @since 26.11
   */
  max_bytes_ratio_before_external_distinct?: number;

  /**
   * The ratio of available memory that is allowed for `GROUP BY`. Once reached, external memory is used for aggregation. For example, if set to `0.6`, `GROUP BY` will allow using 60% of the available memory (to server/user/merges) at the beginning of the execution, after that, it will start using external aggregation.
   * @since 25.1
   */
  max_bytes_ratio_before_external_group_by?: number;

  /**
   * The ratio of available memory that is allowed for `JOIN`. Once reached, the hash join will be converted to grace hash join to spill the right-side data to disk. For example, if set to `0.6`, `JOIN` will allow using `60%` of the available memory (to server/user/merges) for the right-side hash table at the beginning of the execution; after that, it starts spilling to disk. If both `max_bytes_before_external_join` and `max_bytes_ratio_before_external_join` are set, the smaller resulting threshold is used. If the ratio is `0`, only the absolute setting applies. Has effect for every hash-based `join_algorithm`, including `grace_hash`, provided a temporary data path is configured.
   * @since 26.6
   */
  max_bytes_ratio_before_external_join?: number;

  /**
   * Fraction of available server or user memory used to calculate the threshold for spilling the set of `IN` with a subquery to disk, at the start of execution. For example, `0.5` uses half of the available memory. Values must be at least `0` and less than `1`. `0` disables this threshold. Without an applicable server or user memory limit, the ratio has no effect. `max_memory_usage` does not affect this calculation. To configure spilling relative to that limit, use `max_bytes_before_external_set`, leaving room for additional memory usage.
   * @since 26.11
   */
  max_bytes_ratio_before_external_set?: number;

  /**
   * The ratio of available memory that is allowed for `ORDER BY`. Once reached, external sort is used. For example, if set to `0.6`, `ORDER BY` will allow using `60%` of available memory (to server/user/merges) at the beginning of the execution, after that, it will start using external sort. Note, that `max_bytes_before_external_sort` is still respected, spilling to disk will be done only if the sorting block is bigger then `max_bytes_before_external_sort`.
   * @since 25.1
   */
  max_bytes_ratio_before_external_sort?: number;

  /**
   * The maximum number of bytes (of uncompressed data) that can be read from a table when running a query. The restriction is checked for each processed chunk of data, applied only to the deepest table expression and when reading from a remote server, checked only on the remote server.
   */
  max_bytes_to_read?: bigint;

  /**
   * The maximum number of bytes (of uncompressed data) that can be read from a local table on a leaf node when running a distributed query. While distributed queries can issue a multiple sub-queries to each shard (leaf) - this limit will be checked only on the read stage on the leaf nodes and will be ignored on the merging of results stage on the root node. For example, a cluster consists of 2 shards and each shard contains a table with 100 bytes of data. A distributed query which is supposed to read all the data from both tables with setting `max_bytes_to_read=150` will fail as in total it will be 200 bytes. A query with `max_bytes_to_read_leaf=150` will succeed since leaf nodes will read 100 bytes at max. The restriction is checked for each processed chunk of data. <Note> This setting is unstable with `prefer_localhost_replica=1`. </Note>
   */
  max_bytes_to_read_leaf?: bigint;

  /**
   * The maximum number of bytes before sorting. If more than the specified amount of uncompressed bytes have to be processed for ORDER BY operation, the behavior will be determined by the `sort_overflow_mode` which by default is set to `throw`.
   */
  max_bytes_to_sort?: bigint;

  /**
   * The maximum number of bytes (uncompressed data) that can be passed to a remote server or saved in a temporary table when the GLOBAL IN/JOIN section is executed.
   */
  max_bytes_to_transfer?: bigint;

  /**
   * The maximum number of columns that can be read from a table in a single query. If a query requires reading more than the specified number of columns, an exception is thrown. <Tip> This setting is useful for preventing overly complex queries. </Tip> `0` value means unlimited.
   */
  max_columns_to_read?: bigint;

  /**
   * The maximum size of blocks of uncompressed data before compressing for writing to a table. By default, 1,048,576 (1 MiB). Specifying a smaller block size generally leads to slightly reduced compression ratio, the compression and decompression speed increases slightly due to cache locality, and memory consumption is reduced. <Note> This is an expert-level setting, and you shouldn't change it if you're just getting started with ClickHouse. </Note> Don't confuse blocks for compression (a chunk of memory consisting of bytes) with blocks for query processing (a set of rows from a table).
   */
  max_compress_block_size?: bigint;

  /**
   * Throw exception if the current number of simultaneously processed queries reaches or exceeds this setting's value. Example: `max_concurrent_queries_for_all_users` can be set to 99 for all users and database administrator can set it to 100 for themselves to run queries for investigation even when the server is overloaded. Modifying the setting for one query or user does not affect other queries. Possible values: - Positive integer. - 0 — No limit. **Example** ```xml <max_concurrent_queries_for_all_users>99</max_concurrent_queries_for_all_users> ``` **See Also** - [max_concurrent_queries](/reference/settings/server-settings/settings/max-concurrent#max_concurrent_queries) Cloud default value: `1000`.
   */
  max_concurrent_queries_for_all_users?: bigint;

  /**
   * The maximum number of simultaneously processed queries per user. Possible values: - Positive integer. - 0 — No limit. **Example** ```xml <max_concurrent_queries_for_user>5</max_concurrent_queries_for_user> ```
   */
  max_concurrent_queries_for_user?: bigint;

  /**
   * Maximum number of Paimon snapshots to consume per incremental read. 0 means no limit.
   * @since 26.6
   */
  max_consume_snapshots?: bigint;

  /**
   * The maximum number of simultaneous connections with remote servers for distributed processing of a single query to a single Distributed table. We recommend setting a value no less than the number of servers in the cluster. The following parameters are only used when creating Distributed tables (and when launching a server), so there is no reason to change them at runtime.
   */
  max_distributed_connections?: bigint;

  /**
   * Limits the maximum depth of recursive queries for [Distributed](/reference/engines/table-engines/special/distributed) tables. If the value is exceeded, the server throws an exception. Possible values: - Positive integer. - 0 — Unlimited depth.
   */
  max_distributed_depth?: bigint;

  /**
   * The maximal size of buffer for parallel downloading (e.g. for URL engine) per each thread.
   */
  max_download_buffer_size?: bigint;

  /**
   * The maximum number of threads to download data (e.g. for URL engine).
   */
  max_download_threads?: number;

  /**
   * Maximum query estimate execution time in seconds. Checked on every data block when [`timeout_before_checking_execution_speed`](/reference/settings/session-settings/other#timeout_before_checking_execution_speed) expires.
   */
  max_estimated_execution_time?: number;

  /**
   * The maximum number of execution rows per second. Checked on every data block when [`timeout_before_checking_execution_speed`](/reference/settings/session-settings/other#timeout_before_checking_execution_speed) expires. If the execution speed is high, the execution speed will be reduced.
   */
  max_execution_speed?: bigint;

  /**
   * The maximum number of execution bytes per second. Checked on every data block when [`timeout_before_checking_execution_speed`](/reference/settings/session-settings/other#timeout_before_checking_execution_speed) expires. If the execution speed is high, the execution speed will be reduced.
   */
  max_execution_speed_bytes?: bigint;

  /**
   * The maximum query execution time in seconds. The `max_execution_time` parameter can be a bit tricky to understand. It operates based on interpolation relative to the current query execution speed (this behaviour is controlled by [`timeout_before_checking_execution_speed`](/reference/settings/session-settings/other#timeout_before_checking_execution_speed)). ClickHouse will interrupt a query if the projected execution time exceeds the specified `max_execution_time`. By default, the `timeout_before_checking_execution_speed` is set to 10 seconds. This means that after 10 seconds of query execution, ClickHouse will begin estimating the total execution time. If, for example, `max_execution_time` is set to 3600 seconds (1 hour), ClickHouse will terminate the query if the estimated time exceeds this 3600-second limit. If you set `timeout_before_checking_execution_speed` to 0, ClickHouse will use the clock time as the basis for `max_execution_time`. If query runtime exceeds the specified number of seconds, the behavior will be determined by the 'timeout_overflow_mode', which by default is set to `throw`. <Note> The timeout is checked and the query can stop only in designated places during data processing. It currently cannot stop during merging of aggregation states, nor during most of query analysis (establishing a connection to a remote replica is one place where it can), and the actual run time will be higher than the value of this setting. </Note>
   */
  max_execution_time?: number;

  /**
   * Similar semantically to [`max_execution_time`](#max_execution_time) but only applied on leaf nodes for distributed or remote queries. For example, if we want to limit the execution time on a leaf node to `10s` but have no limit on the initial node, instead of having `max_execution_time` in the nested subquery settings: ```sql SELECT count() FROM cluster(cluster, view(SELECT * FROM t SETTINGS max_execution_time = 10)); ``` We can use `max_execution_time_leaf` as the query settings: ```sql SELECT count() FROM cluster(cluster, view(SELECT * FROM t)) SETTINGS max_execution_time_leaf = 10; ```
   */
  max_execution_time_leaf?: number;

  /**
   * Maximum size of query syntax tree in number of nodes after expansion of aliases and the asterisk. The same limit also bounds the number of nodes created by substituting `WITH` elements (common table expressions and aliased expressions) into the query. This applies wherever `WITH` elements are substituted, including `SELECT` queries, `CREATE VIEW` and `CREATE MATERIALIZED VIEW`, `ATTACH` with a full definition, `ALTER TABLE ... MODIFY QUERY`, mutation expressions in `ALTER TABLE ... UPDATE/DELETE` and lightweight `UPDATE`, distributed `INSERT ... SELECT`, and the propagation of `WITH` elements to all parts of a `UNION`. If the limit is exceeded, the query fails with the `TOO_BIG_AST` error.
   */
  max_expanded_ast_elements?: bigint;

  /**
   * Amount of retries while fetching partition from another host.
   */
  max_fetch_partition_retries_count?: bigint;

  /**
   * Sets the maximum number of parallel threads for the `SELECT` query data read phase with the [FINAL](/reference/statements/select/from#final-modifier) modifier. Possible values: - Positive integer. - 0 or 1 — Disabled. `SELECT` queries are executed in a single thread.
   */
  max_final_threads?: number;

  /**
   * Max number of HTTP GET redirects hops allowed. Ensures additional security measures are in place to prevent a malicious server from redirecting your requests to unexpected services.nnIt is the case when an external server redirects to another address, but that address appears to be internal to the company's infrastructure, and by sending an HTTP request to an internal server, you could request an internal API from the internal network, bypassing the auth, or even query other services, such as Redis or Memcached. When you don't have an internal infrastructure (including something running on your localhost), or you trust the server, it is safe to allow redirects. Although keep in mind, that if the URL uses HTTP instead of HTTPS, and you will have to trust not only the remote server but also your ISP and every network in the middle. Cloud default value: `10`.
   */
  max_http_get_redirects?: bigint;

  /**
   * Defines the maximum length for each regular expression in the [hyperscan multi-match functions](/reference/functions/regular-functions/string-search-functions#multiMatchAny). Possible values: - Positive integer. - 0 - The length is not limited. **Example** Query: ```sql SELECT multiMatchAny('abcd', ['ab','bcd','c','d']) SETTINGS max_hyperscan_regexp_length = 3; ``` Result: ```text ┌─multiMatchAny('abcd', ['ab', 'bcd', 'c', 'd'])─┐ │ 1 │ └────────────────────────────────────────────────┘ ``` Query: ```sql SELECT multiMatchAny('abcd', ['ab','bcd','c','d']) SETTINGS max_hyperscan_regexp_length = 2; ``` Result: ```text Exception: Regexp length too large. ``` **See Also** - [max_hyperscan_regexp_total_length](#max_hyperscan_regexp_total_length)
   */
  max_hyperscan_regexp_length?: bigint;

  /**
   * Sets the maximum length total of all regular expressions in each [hyperscan multi-match function](/reference/functions/regular-functions/string-search-functions#multiMatchAny). Possible values: - Positive integer. - 0 - The length is not limited. **Example** Query: ```sql SELECT multiMatchAny('abcd', ['a','b','c','d']) SETTINGS max_hyperscan_regexp_total_length = 5; ``` Result: ```text ┌─multiMatchAny('abcd', ['a', 'b', 'c', 'd'])─┐ │ 1 │ └─────────────────────────────────────────────┘ ``` Query: ```sql SELECT multiMatchAny('abcd', ['ab','bc','c','d']) SETTINGS max_hyperscan_regexp_total_length = 5; ``` Result: ```text Exception: Total regexp lengths too large. ``` **See Also** - [max_hyperscan_regexp_length](#max_hyperscan_regexp_length)
   */
  max_hyperscan_regexp_total_length?: bigint;

  /**
   * The maximum size of blocks (in a count of rows) to form for insertion into a table. This setting controls block formation in two contexts: 1. Format parsing: When the server parses row-based input formats (CSV, TSV, JSONEachRow, etc.) from any interface (HTTP, clickhouse-client with inline data, gRPC, PostgreSQL wire protocol), blocks are emitted when: - Both min_insert_block_size_rows AND min_insert_block_size_bytes are reached, OR - Either max_insert_block_size_rows OR max_insert_block_size_bytes is reached Note: When using clickhouse-client or clickhouse-local to read from a file, the client itself parses the data and this setting applies on the client side. 2. INSERT operations: During INSERT queries and when data flows through materialized views, this setting's behavior depends on `use_strict_insert_block_limits`: - When enabled: Blocks are emitted when: - Min thresholds (AND): Both min_insert_block_size_rows AND min_insert_block_size_bytes are reached - Max thresholds (OR): Either max_insert_block_size_rows OR max_insert_block_size_bytes is reached - When disabled: Blocks are emitted when min_insert_block_size_rows OR min_insert_block_size_bytes is reached. The max_insert_block_size settings are not enforced. Possible values: - Positive integer.
   */
  max_insert_block_size?: bigint;

  /**
   * The maximum size of blocks (in bytes) to form for insertion into a table. This setting works together with max_insert_block_size_rows and controls block formation in the same context. See max_insert_block_size_rows for detailed information about when and how these settings are applied. Possible values: - Positive integer. - 0 — setting does not participate in block formation.
   * @since 26.2
   */
  max_insert_block_size_bytes?: bigint;

  /**
   * The maximum number of streams (columns) to delay final part flush. Default - auto (100 in case of underlying storage supports parallel write, for example S3 and disabled otherwise) Cloud default value: `50`.
   */
  max_insert_delayed_streams_for_parallel_write?: bigint;

  /**
   * The maximum number of threads to execute the `INSERT` query. This applies both to `INSERT SELECT` and to a plain `INSERT` whose data is sent from `clickhouse-client` or over the HTTP interface. The writing side of the pipeline (squashing the blocks and writing them to the destination table) is parallelized across up to this many threads. Possible values: - 0 — Auto. Uses the number of CPU cores available to the server (the same auto value as [`max_threads`](#max_threads)), reduced under memory pressure by [`max_insert_threads_min_free_memory_per_thread`](#max_insert_threads_min_free_memory_per_thread). - 1 — the `INSERT` is executed in a single thread (no parallel execution). Use this to preserve the insertion order of `INSERT ... SELECT`. - Positive integer bigger than 1 — Parallel execution with the specified number of threads. Before version 26.8 the default was `1` (no parallel execution). Since 26.8 the default (`0`) resolves to the number of CPU cores, so `INSERT` is parallelized by default. Set `max_insert_threads` to `1` (or use the `compatibility` setting) to restore the previous behavior. Cloud default value: - `1` for nodes with 8 GiB memory - `2` for nodes with 16 GiB memory - `4` for larger nodes Parallel `INSERT SELECT` has effect only if the `SELECT` part is executed in parallel, see [`max_threads`](#max_threads) setting. For a plain `INSERT`, the input data is read and parsed as a single stream, and the pipeline is then resized to this many streams for writing. The write-side parallelization applies only to synchronous plain `INSERT`s: asynchronous inserts ([`async_insert`](#async_insert) `= 1`) are stored in a queue and flushed in the background, so they are unaffected by this setting and always stay single-stream. The writing side is parallelized only when it is safe to do so; otherwise it stays single-stream and this setting has no effect on it. In particular, the write is kept single-stream when [`use_strict_insert_block_limits`](#use_strict_insert_block_limits) is enabled, a destination table (or a table it forwards to) deduplicates inserted blocks, and insert deduplication is enabled for the query (see [`deduplicate_insert`](#deduplicate_insert)), when the destination has dependent materialized views — including views of a table the destination forwards to, e.g. behind an `Alias` — (unless [`parallel_view_processing`](#parallel_view_processing) is enabled and the dependent view chains are free of deduplication hazards — deduplication in the views is disabled ([`deduplicate_blocks_in_dependent_materialized_views`](#deduplicate_blocks_in_dependent_materialized_views)) or no dependent view path can deduplicate), and always for `Buffer` and `Distributed` destinations. A `Buffer` flushes in its own context and a `Distributed` forwards the write to a remote shard (which may itself buffer the data), so this query's deduplication settings do not govern the final write and it is kept single-stream regardless of them. A non-parallel quorum insert ([`insert_quorum`](#insert_quorum) is `2` or greater, or `'auto'`, and [`insert_quorum_parallel`](#insert_quorum_parallel) is disabled) also stays single-stream, because it permits only one in-flight quorum part per table. Higher values will lead to higher memory usage.
   */
  max_insert_threads?: number;

  /**
   * Same as `max_threads_min_free_memory_per_thread`, but applied to `max_insert_threads` instead of `max_threads`. The default is higher because insert pipelines typically hold larger per-thread buffers (merge tree parts, compression blocks) than read pipelines. If the amount of free memory is less than `max_insert_threads` multiplied by this value, `max_insert_threads` is reduced to fit, down to a minimum of `1`. Set to `0` to disable this limit.
   * @since 26.6
   */
  max_insert_threads_min_free_memory_per_thread?: bigint;

  /**
   * Maximum block size in bytes for JOIN result (if join algorithm supports it). 0 means unlimited.
   * @since 25.9
   */
  max_joined_block_size_bytes?: bigint;

  /**
   * Maximum block size for JOIN result (if join algorithm supports it). 0 means unlimited.
   */
  max_joined_block_size_rows?: bigint;

  /**
   * SELECT queries with LIMIT bigger than this setting cannot use vector similarity indices. Helps to prevent memory overflows in vector similarity indices.
   * @since 25.6
   */
  max_limit_for_vector_search_queries?: bigint;

  /**
   * The maximum speed of local reads in bytes per second. The limit applies to the data read from the block devices: reads that are served from the OS page cache are not accounted for, as long as the read method can detect them (which is the case for the default `local_filesystem_read_method = 'pread_threadpool'`, for `pread`, and for the reads of the filesystem cache files).
   */
  max_local_read_bandwidth?: bigint;

  /**
   * The maximum speed of local writes in bytes per second.
   */
  max_local_write_bandwidth?: bigint;

  /**
   * Cloud default value: depends on the amount of RAM on the replica. The maximum amount of RAM to use for running a query on a single server. A value of `0` means unlimited. This setting does not consider the volume of available memory or the total volume of memory on the machine. The restriction applies to a single query within a single server. You can use `SHOW PROCESSLIST` to see the current memory consumption for each query. Peak memory consumption is tracked for each query and written to the log. Memory usage is not fully tracked for states of the following aggregate functions from `String` and `Array` arguments: - `min` - `max` - `any` - `anyLast` - `argMin` - `argMax` Memory consumption is also restricted by the parameters [`max_memory_usage_for_user`](/reference/settings/session-settings/max-memory-usage#max_memory_usage_for_user) and [`max_server_memory_usage`](/reference/settings/server-settings/settings/max-server-memory-usage#max_server_memory_usage).
   */
  max_memory_usage?: bigint;

  /**
   * The maximum amount of RAM to use for running a user's queries on a single server. Zero means unlimited. By default, the amount is not restricted (`max_memory_usage_for_user = 0`). Also see the description of [`max_memory_usage`](/reference/settings/session-settings/max-memory-usage#max_memory_usage). For example if you want to set `max_memory_usage_for_user` to 1000 bytes for a user named `clickhouse_read`, you can use the statement ```sql ALTER USER clickhouse_read SETTINGS max_memory_usage_for_user = 1000; ``` You can verify it worked by logging out of your client, logging back in, then use the `getSetting` function: ```sql SELECT getSetting('max_memory_usage_for_user'); ```
   */
  max_memory_usage_for_user?: bigint;

  /**
   * Limits the speed of the data exchange over the network in bytes per second. This setting applies to every query. Possible values: - Positive integer. - 0 — Bandwidth control is disabled.
   */
  max_network_bandwidth?: bigint;

  /**
   * Limits the speed that data is exchanged at over the network in bytes per second. This setting applies to all concurrently running queries on the server. Possible values: - Positive integer. - 0 — Control of the data speed is disabled.
   */
  max_network_bandwidth_for_all_users?: bigint;

  /**
   * Limits the speed of the data exchange over the network in bytes per second. This setting applies to all concurrently running queries performed by a single user. Possible values: - Positive integer. - 0 — Control of the data speed is disabled.
   */
  max_network_bandwidth_for_user?: bigint;

  /**
   * Limits the data volume (in bytes) that is received or transmitted over the network when executing a query. This setting applies to every individual query. Possible values: - Positive integer. - 0 — Data volume control is disabled.
   */
  max_network_bytes?: bigint;

  /**
   * Maximal number of partitions in table to apply independent aggregation per partition. Part of the cost heuristic of [allow_aggregate_partitions_independently](#allow_aggregate_partitions_independently).
   */
  max_number_of_partitions_for_independent_aggregation?: bigint;

  /**
   * Maximal number of partitions in table to apply independent `DISTINCT` per partition. Part of the cost heuristic of [allow_distinct_partitions_independently](#allow_distinct_partitions_independently).
   * @since 26.9
   */
  max_number_of_partitions_for_independent_distinct?: bigint;

  /**
   * Maximal number of partitions in table to apply independent evaluation of window functions per partition. Part of the cost heuristic of [allow_window_partitions_independently](#allow_window_partitions_independently).
   * @since 26.9
   */
  max_number_of_partitions_for_independent_window?: bigint;

  /**
   * The maximum number of replicas for each shard when executing a query. Possible values: - Positive integer. **Additional Info** This options will produce different results depending on the settings used. ### Parallel processing using `SAMPLE` key A query may be processed faster if it is executed on several servers in parallel. But the query performance may degrade in the following cases: - The position of the sampling key in the partitioning key does not allow efficient range scans. - Adding a sampling key to the table makes filtering by other columns less efficient. - The sampling key is an expression that is expensive to calculate. - The cluster latency distribution has a long tail, so that querying more servers increases the query overall latency. ### Parallel processing using [parallel_replicas_custom_key](#parallel_replicas_custom_key) This setting is useful for any replicated table.
   */
  max_parallel_replicas?: bigint;

  /**
   * Maximum parser backtracking (how many times it tries different alternatives in the recursive descend parsing process).
   */
  max_parser_backtracks?: bigint;

  /**
   * Limits maximum recursion depth in the recursive descent parser. Allows controlling the stack size. Possible values: - Positive integer. - 0 — Recursion depth is unlimited.
   */
  max_parser_depth?: bigint;

  /**
   * The maximum number of threads to parse data in input formats that support parallel parsing. By default, it is determined automatically.
   */
  max_parsing_threads?: number;

  /**
   * Restriction on dropping partitions in query time. The value `0` means that you can drop partitions without any restrictions. Cloud default value: 1 TB. <Note> This query setting overwrites its server setting equivalent, see [max_partition_size_to_drop](/reference/settings/server-settings/settings/max#max_partition_size_to_drop) </Note>
   */
  max_partition_size_to_drop?: bigint;

  /**
   * Limits the maximum number of partitions in a single inserted block and an exception is thrown if the block contains too many partitions. - Positive integer. - `0` — Unlimited number of partitions. **Details** When inserting data, ClickHouse calculates the number of partitions in the inserted block. If the number of partitions is more than `max_partitions_per_insert_block`, ClickHouse either logs a warning or throws an exception based on `throw_on_max_partitions_per_insert_block`. Exceptions have the following text: > "Too many partitions for a single INSERT block (`partitions_count` partitions, limit is " + toString(max_partitions) + "). The limit is controlled by the 'max_partitions_per_insert_block' setting. A large number of partitions is a common misconception. It will lead to severe negative performance impact, including slow server startup, slow INSERT queries and slow SELECT queries. Recommended total number of partitions for a table is under 1000..10000. Please note, that partitioning is not intended to speed up SELECT queries (ORDER BY key is sufficient to make range queries fast). Partitions are intended for data manipulation (DROP PARTITION, etc)." <Note> This setting is a safety threshold because using a large number of partitions is a common misconception. </Note>
   */
  max_partitions_per_insert_block?: bigint;

  /**
   * Limits the maximum number of partitions that can be accessed in a single query. The setting value specified when the table is created can be overridden via query-level setting. Possible values: - Positive integer - `-1` - unlimited (default) <Note> You can also specify the MergeTree setting [`max_partitions_to_read`](/reference/settings/session-settings/max-partitions#max_partitions_to_read) in tables' setting. </Note>
   */
  max_partitions_to_read?: bigint;

  /**
   * If the number of rows to read from the projection index is less than or equal to this threshold, ClickHouse will try to apply the projection index during query execution.
   * @since 25.12
   */
  max_projection_rows_to_use_projection_index?: bigint;

  /**
   * The maximum number of bytes of a query string parsed by the SQL parser. Data in the VALUES clause of INSERT queries is processed by a separate stream parser (that consumes O(1) RAM) and not affected by this restriction. <Note> `max_query_size` cannot be set within an SQL query (e.g., `SELECT now() SETTINGS max_query_size=10000`) because ClickHouse needs to allocate a buffer to parse the query, and this buffer size is determined by the `max_query_size` setting, which must be configured before the query is executed. </Note>
   */
  max_query_size?: bigint;

  /**
   * Maximum value for distribution shape parameters in random distribution functions such as `randChiSquared`, `randStudentT`, and `randFisherF`. This prevents extremely long computation times with extreme parameter values. `0` disables the limit; values for which the sampler does not terminate at all are still rejected.
   * @since 26.5
   */
  max_rand_distribution_parameter?: number;

  /**
   * Maximum number of trials allowed for random distribution functions such as `randBinomial` and `randNegativeBinomial`. This prevents extremely long computation times with large trial counts. `0` disables the limit, and the setting may be raised above its default, except for `randBinomial` with a probability strictly between 0 and 1, which always rejects more than 10^9 trials because the cost of a single sample is proportional to the number of trials in the worst case, with a probability that grows with it. The probabilities 0 and 1 are exempt from that hard cap, because a sample costs constant time for them.
   * @since 26.5
   */
  max_rand_distribution_trials?: bigint;

  /**
   * The maximum size of the buffer to read from the filesystem. Values above 256 MiB are clamped to 256 MiB, as a read buffer never needs to be larger.
   */
  max_read_buffer_size?: bigint;

  /**
   * The maximum size of the buffer to read from local filesystem. If set to 0 then max_read_buffer_size will be used. Values above 256 MiB are clamped to 256 MiB, as a read buffer never needs to be larger.
   */
  max_read_buffer_size_local_fs?: bigint;

  /**
   * The maximum size of the buffer to read from remote filesystem. If set to 0 then max_read_buffer_size will be used. Values above 256 MiB are clamped to 256 MiB, as a read buffer never needs to be larger.
   */
  max_read_buffer_size_remote_fs?: bigint;

  /**
   * Maximum limit on recursive CTE evaluation depth
   */
  max_recursive_cte_evaluation_depth?: bigint;

  /**
   * The maximum speed of data exchange over the network in bytes per second for read.
   */
  max_remote_read_network_bandwidth?: bigint;

  /**
   * The maximum speed of data exchange over the network in bytes per second for write.
   */
  max_remote_write_network_bandwidth?: bigint;

  /**
   * Disables lagging replicas for distributed queries. See [Replication](/reference/engines/table-engines/mergetree-family/replication). Sets the time in seconds. If a replica's lag is greater than or equal to the set value, this replica is not used. Possible values: - Positive integer. - 0 — Replica lags are not checked. To prevent the use of any replica with a non-zero lag, set this parameter to 1. Used when performing `SELECT` from a distributed table that points to replicated tables.
   */
  max_replica_delay_for_distributed_queries?: bigint;

  /**
   * Limits the result size in bytes (uncompressed). The query will stop after processing a block of data if the threshold is met, but it will not cut the last block of the result, therefore the result size can be larger than the threshold. **Caveats** The result size in memory is taken into account for this threshold. Even if the result size is small, it can reference larger data structures in memory, representing dictionaries of LowCardinality columns, and Arenas of AggregateFunction columns, so the threshold can be exceeded despite the small result size. <Warning> The setting is fairly low level and should be used with caution </Warning>
   */
  max_result_bytes?: bigint;

  /**
   * Limits the number of rows in the result. Also checked for subqueries, and on remote servers when running parts of a distributed query. No limit is applied when the value is `0`. The query will stop after processing a block of data if the threshold is met, but it will not cut the last block of the result, therefore the result size can be larger than the threshold.
   */
  max_result_rows?: bigint;

  /**
   * Maximum size in bytes of the per-query reverse dictionary lookup cache used by the function `dictGetKeys`. The cache stores serialized key tuples per attribute value to avoid re-scanning the dictionary within the same query. When the limit is reached, entries are evicted using LRU. Set to 0 to disable caching.
   * @since 26.1
   */
  max_reverse_dictionary_lookup_cache_size_bytes?: bigint;

  /**
   * Maximum number of rows in the set for lazy FINAL optimization. If exceeded, falls back to normal FINAL.
   * @since 26.5
   */
  max_rows_for_lazy_final?: bigint;

  /**
   * The maximum number of different rows when using DISTINCT.
   */
  max_rows_in_distinct?: bigint;

  /**
   * Limits the number of rows in the right-side data structure (typically a hash table) used when joining tables. This setting applies to [SELECT ... JOIN](/reference/statements/select/join) operations and the [Join](/reference/engines/table-engines/special/join) table engine. If a query contains multiple joins, ClickHouse checks this setting for every intermediate result. It is a hard cap for every hash-based `join_algorithm`: when the limit is reached the query throws or breaks according to [`join_overflow_mode`](/reference/settings/session-settings/join#join_overflow_mode). It never makes a join spill to disk — that decision belongs to [`max_bytes_before_external_join`](/reference/settings/session-settings/max-bytes#max_bytes_before_external_join) and [`max_bytes_ratio_before_external_join`](/reference/settings/session-settings/max-bytes#max_bytes_ratio_before_external_join). The exception is `legacy_join_size_limits_trigger_spilling`: with it on, the part of a join that already runs on disk treats this limit as a further spill trigger instead of a cap. When an `ON` section determines no join key at all, there is no algorithm to choose: the limit applies to the right side materialized by the [block nested loop join](/reference/statements/select/join#join-with-an-arbitrary-on-condition), spilled blocks included, and the action on overflow is [`join_overflow_mode`](/reference/settings/session-settings/join#join_overflow_mode). Possible values: - Positive integer. - `0` — Unlimited number of rows.
   */
  max_rows_in_join?: bigint;

  /**
   * The maximum number of rows for a data set in the IN clause created from a subquery.
   */
  max_rows_in_set?: bigint;

  /**
   * Maximal size of the set to filter joined tables by each other's row sets before joining. Possible values: - 0 — Disable. - Any positive integer.
   */
  max_rows_in_set_to_optimize_join?: bigint;

  /**
   * The maximum number of unique keys received from aggregation. This setting lets you limit memory consumption when aggregating. If aggregation during GROUP BY is generating more than the specified number of rows (unique GROUP BY keys), the behavior will be determined by the 'group_by_overflow_mode' which by default is `throw`, but can be also switched to an approximate GROUP BY mode.
   */
  max_rows_to_group_by?: bigint;

  /**
   * The maximum number of rows that can be read from a table when running a query. The restriction is checked for each processed chunk of data, applied only to the deepest table expression and when reading from a remote server, checked only on the remote server.
   */
  max_rows_to_read?: bigint;

  /**
   * The maximum number of rows that can be read from a local table on a leaf node when running a distributed query. While distributed queries can issue multiple sub-queries to each shard (leaf) - this limit will be checked only on the read stage on the leaf nodes and ignored on the merging of results stage on the root node. For example, a cluster consists of 2 shards and each shard contains a table with 100 rows. The distributed query which is supposed to read all the data from both tables with setting `max_rows_to_read=150` will fail, as in total there will be 200 rows. A query with `max_rows_to_read_leaf=150` will succeed, since leaf nodes will read at max 100 rows. The restriction is checked for each processed chunk of data. <Note> This setting is unstable with `prefer_localhost_replica=1`. </Note>
   */
  max_rows_to_read_leaf?: bigint;

  /**
   * The maximum number of rows before sorting. This allows you to limit memory consumption when sorting. If more than the specified amount of records have to be processed for the ORDER BY operation, the behavior will be determined by the `sort_overflow_mode` which by default is set to `throw`.
   */
  max_rows_to_sort?: bigint;

  /**
   * Maximum size (in rows) that can be passed to a remote server or saved in a temporary table when the GLOBAL IN/JOIN section is executed.
   */
  max_rows_to_transfer?: bigint;

  /**
   * Maximum number of simultaneous sessions per authenticated user to the ClickHouse server. Example: ```xml <profiles> <single_session_profile> <max_sessions_for_user>1</max_sessions_for_user> </single_session_profile> <two_sessions_profile> <max_sessions_for_user>2</max_sessions_for_user> </two_sessions_profile> <unlimited_sessions_profile> <max_sessions_for_user>0</max_sessions_for_user> </unlimited_sessions_profile> </profiles> <users> <!-- User Alice can connect to a ClickHouse server no more than once at a time. --> <Alice> <profile>single_session_user</profile> </Alice> <!-- User Bob can use 2 simultaneous sessions. --> <Bob> <profile>two_sessions_profile</profile> </Bob> <!-- User Charles can use arbitrarily many of simultaneous sessions. --> <Charles> <profile>unlimited_sessions_profile</profile> </Charles> </users> ``` Possible values: - Positive integer - `0` - infinite count of simultaneous sessions (default)
   */
  max_sessions_for_user?: bigint;

  /**
   * For how many elements it is allowed to preallocate space in all hash tables in total before aggregation
   */
  max_size_to_preallocate_for_aggregation?: bigint;

  /**
   * For how many elements it is allowed to preallocate space in all hash tables in total before join
   */
  max_size_to_preallocate_for_joins?: bigint;

  /**
   * When `skip_unavailable_shards` is enabled, limits the maximum number of shards that can be silently skipped. If the number of unavailable shards exceeds this value, an exception is thrown instead of silently skipping. A value of 0 means no limit on the count. On a read, skipping *every* shard before any of them returned data still throws `ALL_CONNECTION_TRIES_FAILED`, because such a query has no partial result to return. This limit applies to reads only.
   * @since 26.4
   */
  max_skip_unavailable_shards_num?: bigint;

  /**
   * When `skip_unavailable_shards` is enabled, limits the maximum ratio (0 to 1) of shards that can be silently skipped. If the ratio of unavailable shards to total shards exceeds this value, an exception is thrown instead of silently skipping. A value of 0 means no limit on the ratio. On a read, skipping *every* shard before any of them returned data still throws `ALL_CONNECTION_TRIES_FAILED`, because such a query has no partial result to return. This limit applies to reads only.
   * @since 26.4
   */
  max_skip_unavailable_shards_ratio?: number;

  /**
   * If is not zero, limit the number of threads reading data from files in *Cluster table functions.
   * @since 26.1
   */
  max_streams_for_files_processing_in_cluster_functions?: bigint;

  /**
   * If is not zero, limit the number of reading streams for MergeTree table.
   */
  max_streams_for_merge_tree_reading?: bigint;

  /**
   * Limits the number of simultaneously active data streams in a `UNION` step (applies to `UNION ALL`, to `UNION DISTINCT`, because it is implemented via a `UNION ALL` step followed by a `DISTINCT` step, and to a `Merge` table read with plan-based parallel replicas, which is expanded into a union of the reads from its underlying tables). When a `UNION` query has many subqueries, all of them open their read buffers at the same time, leading to memory usage proportional to the number of subqueries. This setting inserts `Concat` processors to narrow the pipeline so that at most this many streams are active at once, drastically reducing peak memory. The actual limit is the minimum of this value and `max_threads * max_streams_for_union_step_to_max_threads_ratio` (either one being 0 means it is ignored). When both are 0, no narrowing is applied. The limit is also not applied when the query plan requires each output stream of the `UNION` to stay individually sorted (for example, when the read-in-order optimization is applied across the `UNION`); in that case correctness of the ordering takes precedence and narrowing is skipped.
   * @since 26.6
   */
  max_streams_for_union_step?: bigint;

  /**
   * This ratio multiplied by `max_threads` determines a limit on simultaneously active streams in a `UNION` step (applies to both `UNION ALL` and `UNION DISTINCT`). The actual limit is the minimum of this computed value and `max_streams_for_union_step` (either one being 0 means it is ignored). For example, with `max_threads = 8` and this ratio set to 1, at most 8 streams will be active. Set to 0 to disable this ratio-based limit. Like `max_streams_for_union_step`, the limit is not applied when the query plan requires each output stream of the `UNION` to stay individually sorted.
   * @since 26.6
   */
  max_streams_for_union_step_to_max_threads_ratio?: number;

  /**
   * Ask more streams when reading from Merge table. Streams will be spread across tables that Merge table will use. This allows more even distribution of work across threads and is especially helpful when merged tables differ in size. The number of streams that read simultaneously is capped by this multiplier as well - except for a `Merge` table read with plan-based parallel replicas ([parallel_replicas_allow_merge_tables](#parallel_replicas_allow_merge_tables)), which is expanded into a union of the reads from its underlying tables and is therefore capped by [max_streams_for_union_step](#max_streams_for_union_step), like any other union.
   */
  max_streams_multiplier_for_merge_tables?: number;

  /**
   * Allows you to use more sources than the number of threads - to more evenly distribute work across threads. It is assumed that this is a temporary solution since it will be possible in the future to make the number of sources equal to the number of threads, but for each source to dynamically select available work for itself.
   */
  max_streams_to_max_threads_ratio?: number;

  /**
   * If a query has more than the specified number of nested subqueries, throws an exception. <Tip> This allows you to have a sanity check to protect against the users of your cluster from writing overly complex queries. </Tip>
   */
  max_subquery_depth?: bigint;

  /**
   * Restriction on deleting tables in query time. The value `0` means that you can delete all tables without any restrictions. Cloud default value: 1 TB. <Note> This query setting overwrites its server setting equivalent, see [max_table_size_to_drop](/reference/settings/server-settings/settings/max-table#max_table_size_to_drop) </Note>
   */
  max_table_size_to_drop?: bigint;

  /**
   * The maximum number of temporary columns that must be kept in RAM simultaneously when running a query, including constant columns. If a query generates more than the specified number of temporary columns in memory as a result of intermediate calculation, then an exception is thrown. <Tip> This setting is useful for preventing overly complex queries. </Tip> `0` value means unlimited.
   */
  max_temporary_columns?: bigint;

  /**
   * The maximum amount of data consumed by temporary files on disk in bytes for all concurrently running queries. Possible values: - Positive integer. - `0` — unlimited (default)
   */
  max_temporary_data_on_disk_size_for_query?: bigint;

  /**
   * The maximum amount of data consumed by temporary files on disk in bytes for all concurrently running user queries. Possible values: - Positive integer. - `0` — unlimited (default)
   */
  max_temporary_data_on_disk_size_for_user?: bigint;

  /**
   * Like `max_temporary_columns`, the maximum number of temporary columns that must be kept in RAM simultaneously when running a query, but without counting constant columns. <Note> Constant columns are formed fairly often when running a query, but they require approximately zero computing resources. </Note>
   */
  max_temporary_non_const_columns?: bigint;

  /**
   * The maximum number of bytes of memory that one temporary table with the `Memory` engine can hold. It applies to tables created with `CREATE TEMPORARY TABLE`, including the default temporary table engine (see `default_temporary_table_engine`), and is counted in the same way as `total_bytes` in `system.tables`. The limit is checked on every `INSERT` into the table (including `CREATE TEMPORARY TABLE ... AS SELECT`), while the data is being received and again before it is added: if the table would exceed it, the `INSERT` throws an exception with the `TOO_MANY_BYTES` error code and the data is not added. An `INSERT` that writes with several threads (see `max_insert_threads`) adds the data of every thread separately, so the data of some threads may already be added when another one throws, but the table never exceeds the limit. The value is taken from the settings of the `INSERT` query. The limit is also checked after a mutation (`ALTER TABLE ... UPDATE`, `MATERIALIZE COLUMN`, etc.), with the value from the settings of the `ALTER` query: if the mutated data would exceed it, the mutation throws an exception with the `TOO_MANY_BYTES` error code and the data is left unchanged. Note that the `max_bytes_to_keep` setting of the `Memory` engine is different: it evicts the oldest data instead of rejecting the new one. If both are set, the eviction is applied first. Possible values: - Positive integer. - `0` — unlimited (default)
   * @since 26.11
   */
  max_temporary_table_memory_usage?: bigint;

  /**
   * The maximum size in bytes of the data on disk (compressed) of one temporary table with an engine of the `MergeTree` family. It applies to tables created with `CREATE TEMPORARY TABLE` and is counted in the same way as `total_bytes` in `system.tables`, that is, as the sum of the sizes of the active data parts. The limit is checked on every `INSERT` into the table (including `CREATE TEMPORARY TABLE ... AS SELECT`) before each new data part is committed: if the table would exceed it, the `INSERT` throws an exception with the `TOO_MANY_BYTES` error code and the part is not added. Parts committed earlier by the same `INSERT` stay in the table, as with any other error during an `INSERT` of multiple blocks. The value is taken from the settings of the `INSERT` query. The operations that add existing parts to the table are limited in the same way, with the value from the settings of their query: `ATTACH PART`, `ATTACH PARTITION`, `ATTACH PARTITION ... FROM`, `REPLACE PARTITION ... FROM` and `CREATE TEMPORARY TABLE ... CLONE AS`. They are rejected as a whole, unless they do not increase the size of the table. For `ATTACH PARTITION`, the check is done once for all its parts before they are attached, so writes running concurrently with it may make the table exceed the limit slightly. The parts written by background merges and mutations (`ALTER TABLE ... UPDATE`, `MATERIALIZE COLUMN`, etc.) are not checked, so a mutation that makes the data larger can make the table exceed the limit. Possible values: - Positive integer. - `0` — unlimited (default)
   * @since 26.11
   */
  max_temporary_table_size_bytes_compressed?: bigint;

  /**
   * The maximum size in bytes of the uncompressed data of one temporary table with an engine of the `MergeTree` family. It applies to tables created with `CREATE TEMPORARY TABLE` and is counted in the same way as `total_bytes_uncompressed` in `system.tables`. The limit is checked in the same way as `max_temporary_table_size_bytes_compressed`. Possible values: - Positive integer. - `0` — unlimited (default)
   * @since 26.11
   */
  max_temporary_table_size_bytes_uncompressed?: bigint;

  /**
   * The maximum number of temporary tables that can exist in one session at the same time. Only tables created with `CREATE TEMPORARY TABLE` are counted: tables with external data sent with a query and the temporary tables built internally for `GLOBAL IN` / `GLOBAL JOIN` or materialized CTEs are not. The limit is checked when a new temporary table is created, and an exception with the `TOO_MANY_TABLES` error code is thrown if the session already has this number of temporary tables. Replacing an existing temporary table with `CREATE OR REPLACE TEMPORARY TABLE` does not increase the number of tables and is always allowed. Possible values: - Positive integer. - `0` — unlimited (default)
   * @since 26.11
   */
  max_temporary_tables?: bigint;

  /**
   * The maximum number of query processing threads, excluding threads for retrieving data from remote servers (see the ['max_distributed_connections'](/reference/settings/session-settings/max-distributed#max_distributed_connections) parameter). This parameter applies to threads that perform the same stages of the query processing pipeline in parallel. For example, when reading from a table, if it is possible to evaluate expressions with functions, filter with `WHERE` and pre-aggregate for `GROUP BY` in parallel using at least 'max_threads' number of threads, then 'max_threads' are used. For queries that are completed quickly because of a LIMIT, you can set a lower 'max_threads'. For example, if the necessary number of entries are located in every block and max_threads = 8, then 8 blocks are retrieved, although it would have been enough to read just one. The smaller the `max_threads` value, the less memory is consumed. The `max_threads` setting by default matches the number of hardware threads (number of CPU cores) available to ClickHouse. As a special case, for x86 processors with less than 32 CPU cores and SMT (e.g. Intel HyperThreading), ClickHouse uses the number of logical cores (= 2 x physical core count) by default. Without SMT (e.g. Intel HyperThreading), this corresponds to the number of CPU cores. For ClickHouse Cloud users, the default value will display as `auto(N)` where N matches the vCPU size of your service e.g. 2vCPU/8GiB, 4vCPU/16GiB etc. See the settings tab in the Cloud console for a list of all service sizes.
   */
  max_threads?: number;

  /**
   * The maximum number of threads process indices.
   */
  max_threads_for_indexes?: bigint;

  /**
   * Lowers `max_threads` when the server is under memory pressure, to avoid starting highly-parallel queries that are likely to hit the memory limit. Free memory is computed as the server's `max_server_memory_usage` minus the memory currently tracked by the global memory tracker. If that free memory is less than `max_threads` multiplied by this value, `max_threads` is reduced to the largest N such that `N * value <= free_memory`, with a minimum of `1`. Set to `0` to disable this limit. For example, with the default of 1 GiB and 32 GiB of free memory, `max_threads` is capped at 32; with 1 GiB of free memory it falls back to 1. This setting applies to read-side parallelism (`SELECT`, `UNION`, `INTERSECT`/`EXCEPT`, and the `SELECT` side of `INSERT ... SELECT`). For the write side, see `max_insert_threads_min_free_memory_per_thread`.
   * @since 26.6
   */
  max_threads_min_free_memory_per_thread?: bigint;

  /**
   * Small allocations and deallocations are grouped in thread local variable and tracked or profiled only when an amount (in absolute value) becomes larger than the specified value. If the value is higher than 'memory_profiler_step' it will be effectively lowered to 'memory_profiler_step'.
   */
  max_untracked_memory?: bigint;

  /**
   * Maximum number of points, rings, or polygons allowed in a single WKB geometry element during parsing by `readWKB` and related functions. This protects against excessive memory allocations from malformed WKB data. Set to 0 to use the hard-coded limit (100 million).
   * @since 26.5
   */
  max_wkb_geometry_elements?: bigint;

  /**
   * It represents the soft memory limit when the hard limit is reached on the global level. This value is used to compute the overcommit ratio for the query. Zero means skip the query. Read more about [memory overcommit](/concepts/features/configuration/settings/memory-overcommit).
   */
  memory_overcommit_ratio_denominator?: bigint;

  /**
   * It represents the soft memory limit when the hard limit is reached on the user level. This value is used to compute the overcommit ratio for the query. Zero means skip the query. Read more about [memory overcommit](/concepts/features/configuration/settings/memory-overcommit).
   */
  memory_overcommit_ratio_denominator_for_user?: bigint;

  /**
   * Collect random allocations of size less or equal than the specified value with probability equal to `memory_profiler_sample_probability`. 0 means disabled. You may want to set 'max_untracked_memory' to 0 to make this threshold work as expected.
   */
  memory_profiler_sample_max_allocation_size?: bigint;

  /**
   * Collect random allocations of size greater or equal than the specified value with probability equal to `memory_profiler_sample_probability`. 0 means disabled. You may want to set 'max_untracked_memory' to 0 to make this threshold work as expected.
   */
  memory_profiler_sample_min_allocation_size?: bigint;

  /**
   * Collect random allocations and deallocations and write them into system.trace_log with 'MemorySample' trace_type. The probability is for every alloc/free regardless of the size of the allocation (can be changed with `memory_profiler_sample_min_allocation_size` and `memory_profiler_sample_max_allocation_size`). Note that sampling happens only when the amount of untracked memory exceeds 'max_untracked_memory'. You may want to set 'max_untracked_memory' to 0 for extra fine-grained sampling.
   */
  memory_profiler_sample_probability?: number;

  /**
   * Sets the step of memory profiler. Whenever query memory usage becomes larger than every next step in number of bytes the memory profiler will collect the allocating stacktrace and will write it into [trace_log](/reference/system-tables/trace_log). Possible values: - A positive integer number of bytes. - 0 for turning off the memory profiler.
   */
  memory_profiler_step?: bigint;

  /**
   * For testing of `exception safety` - throw an exception every time you allocate memory with the specified probability.
   */
  memory_tracker_fault_probability?: number;

  /**
   * Maximum time thread will wait for memory to be freed in the case of memory overcommit on a user level. If the timeout is reached and memory is not freed, an exception is thrown. Read more about [memory overcommit](/concepts/features/configuration/settings/memory-overcommit).
   */
  memory_usage_overcommit_max_wait_microseconds?: bigint;

  /**
   * When creating a `Merge` table without an explicit schema or when using the `merge` table function, infer schema as a union of not more than the specified number of matching tables. If there is a larger number of tables, the schema will be inferred from the first specified number of tables.
   * @since 25.2
   */
  merge_table_max_tables_to_look_for_schema_inference?: bigint;

  /**
   * When searching for data, ClickHouse checks the data marks in the index file. If ClickHouse finds that required keys are in some range, it divides this range into `merge_tree_coarse_index_granularity` subranges and searches the required keys there recursively. Possible values: - Any positive even integer.
   */
  merge_tree_coarse_index_granularity?: bigint;

  /**
   * Only has an effect in ClickHouse Cloud. Number of granules in stripe of compact part of MergeTree tables to use multibuffer reader, which supports parallel reading and prefetch. In case of reading from remote fs using of multibuffer reader increases number of read request.
   */
  merge_tree_compact_parts_min_granules_to_multibuffer_read?: bigint;

  /**
   * Whether to use only prewhere columns size to determine reading task size.
   */
  merge_tree_determine_task_size_by_prewhere_columns?: boolean;

  /**
   * When a filter cannot be evaluated as a single continuous range of the primary key, for example when it uses key columns other than the first one, ClickHouse runs an iterative generic exclusion search algorithm over the index marks. The same algorithm is used for the analysis of the text index. This setting limits the number of steps (index checks) the algorithm spends on each data part. The budget is spent on the largest remaining mark ranges first. When it is exhausted, the ranges that were not fully analyzed are accepted as a whole, so the query stays correct but may read more granules than an unlimited search would select. A lower budget speeds up index analysis at the cost of reading more data. The limit is approximate rather than a strict cap on the analysis cost: the search can exceed it by roughly one round of splitting, and when the part is already divided into many ranges (for example, by the query condition cache), each of them is checked at least once regardless of the limit. The number of steps the search made for each data part is reported in the trace level log messages of the query, and the `IndexGenericExclusionSearchStepLimitReached` and `TextIndexGenericExclusionSearchStepLimitReached` profile events count how many times the budget was exhausted. The (default) value 0 means unlimited steps. Possible values: - 0 for unlimited steps, or any positive integer.
   * @since 26.8
   */
  merge_tree_generic_exclusion_search_max_steps?: bigint;

  /**
   * If ClickHouse should read more than `merge_tree_max_bytes_to_use_cache` bytes in one query, it does not use the cache of uncompressed blocks. The cache of uncompressed blocks stores data extracted for queries. ClickHouse uses this cache to speed up responses to repeated small queries. This setting protects the cache from trashing by queries that read a large amount of data. The [uncompressed_cache_size](/reference/settings/server-settings/settings/uncompressed-cache#uncompressed_cache_size) server setting defines the size of the cache of uncompressed blocks. Possible values: - Any positive integer.
   */
  merge_tree_max_bytes_to_use_cache?: bigint;

  /**
   * If ClickHouse should read more than `merge_tree_max_rows_to_use_cache` rows in one query, it does not use the cache of uncompressed blocks. The cache of uncompressed blocks stores data extracted for queries. ClickHouse uses this cache to speed up responses to repeated small queries. This setting protects the cache from trashing by queries that read a large amount of data. The [uncompressed_cache_size](/reference/settings/server-settings/settings/uncompressed-cache#uncompressed_cache_size) server setting defines the size of the cache of uncompressed blocks. Possible values: - Any positive integer.
   */
  merge_tree_max_rows_to_use_cache?: bigint;

  /**
   * If the number of bytes to read from one file of a [MergeTree](/reference/engines/table-engines/mergetree-family/mergetree)-engine table exceeds `merge_tree_min_bytes_for_concurrent_read`, then ClickHouse tries to concurrently read from this file in several threads. Possible value: - Positive integer.
   */
  merge_tree_min_bytes_for_concurrent_read?: bigint;

  /**
   * The minimum number of bytes to read from one file before [MergeTree](/reference/engines/table-engines/mergetree-family/mergetree) engine can parallelize reading, when reading from remote filesystem. We do not recommend using this setting. Possible values: - Positive integer.
   */
  merge_tree_min_bytes_for_concurrent_read_for_remote_filesystem?: bigint;

  /**
   * If the distance between two data blocks to be read in one file is less than `merge_tree_min_bytes_for_seek` bytes, then ClickHouse sequentially reads a range of file that contains both blocks, thus avoiding extra seek. Possible values: - Any positive integer.
   */
  merge_tree_min_bytes_for_seek?: bigint;

  /**
   * Per-stream overhead cost expressed as byte-equivalent. Controls the maximum number of read streams created for ordinary local unordered `MergeTree` scans. Ordered, `FINAL`, layered, and parallel-replica reads are not changed. The volume-based cap is `ceil(sqrt(estimated_read_bytes / this_setting))`. ClickHouse also preserves at least 16 streams and at least one quarter of the streams requested before this cap, so the effective stream count is `min(requested_streams, max(volume_based_cap, 16, floor(requested_streams / 4)))`. These lower bounds preserve downstream parallelism for CPU-heavy expressions and aggregations, whose cost is not represented by `estimated_read_bytes`. `estimated_read_bytes` is the uncompressed size of the columns being read over the mark ranges left after index and partition pruning. Uncompressed size is used because per-stream overhead is traded against the work done per stream, which scales with the number of values processed rather than with how well they compress. The cap is not applied when the read volume cannot be estimated conservatively, for example when an old part needs other physical columns to evaluate a newly added `DEFAULT` column, or when a selected range reads only part of a variable-width column. The default of 64 KB is derived from the cost model `T(N) = W/N + F + V·N`, where `W` is useful work, `F` is fixed pipeline overhead, and `V` is per-stream variable cost. The optimal stream count is `sqrt(W/V)`. Expressing `W` in bytes via throughput gives `C = throughput · V ≈ 400 MB/s · 0.17 ms ≈ 64 KB`. Increasing this value reduces the number of streams (more conservative); decreasing it allows more streams. Set to 0 to disable this optimization. Possible values: - Non-negative integer.
   * @since 26.9
   */
  merge_tree_min_bytes_per_read_stream?: bigint;

  /**
   * Min bytes to read per task.
   */
  merge_tree_min_bytes_per_task_for_remote_reading?: bigint;

  /**
   * Hard lower limit on the task size (even when the number of granules is low and the number of available threads is high we won't allocate smaller tasks
   */
  merge_tree_min_read_task_size?: bigint;

  /**
   * If the number of rows to be read from a file of a [MergeTree](/reference/engines/table-engines/mergetree-family/mergetree) table exceeds `merge_tree_min_rows_for_concurrent_read` then ClickHouse tries to perform a concurrent reading from this file on several threads. Possible values: - Positive integer.
   */
  merge_tree_min_rows_for_concurrent_read?: bigint;

  /**
   * The minimum number of lines to read from one file before the [MergeTree](/reference/engines/table-engines/mergetree-family/mergetree) engine can parallelize reading, when reading from remote filesystem. We do not recommend using this setting. Possible values: - Positive integer.
   */
  merge_tree_min_rows_for_concurrent_read_for_remote_filesystem?: bigint;

  /**
   * If the distance between two data blocks to be read in one file is less than `merge_tree_min_rows_for_seek` rows, then ClickHouse does not seek through the file but reads the data sequentially. Possible values: - Any positive integer.
   */
  merge_tree_min_rows_for_seek?: bigint;

  /**
   * Enables prefetching of JSON shared data substreams in Wide parts that are read by seeking to a mark. Such a prefetch reads from the beginning of the granule, which is usually not the position the substream is read from, so it can be wasted. Disable to skip these prefetches.
   * @since 26.9
   */
  merge_tree_prefetch_json_shared_data_substreams?: boolean;

  /**
   * For testing of `PartsSplitter` - split read ranges into intersecting and non intersecting every time you read from MergeTree with the specified probability.
   */
  merge_tree_read_split_ranges_into_intersecting_and_non_intersecting_injection_probability?: number;

  /**
   * Inject artificial delay (in milliseconds) when creating a storage snapshot for MergeTree tables. Used for testing and debugging purposes only. Possible values: - 0 - No delay (default) - N - Delay in milliseconds
   * @since 25.7
   */
  merge_tree_storage_snapshot_sleep_ms?: bigint;

  /**
   * Whether to use constant size tasks for reading from a remote table.
   */
  merge_tree_use_const_size_tasks_for_remote_reading?: boolean;

  /**
   * Enables caching of columns metadata from the file prefixes during reading from remote disks in MergeTree.
   * @since 25.3
   */
  merge_tree_use_deserialization_prefixes_cache?: boolean;

  /**
   * Enables usage of the thread pool for parallel prefixes reading in Wide parts in MergeTree. Size of that thread pool is controlled by server setting `max_prefixes_deserialization_thread_pool_size`.
   * @since 25.3
   */
  merge_tree_use_prefixes_deserialization_thread_pool?: boolean;

  /**
   * When enabled, V1 serialization version of JSON and Dynamic types will be used in MergeTree instead of V2. Changing this setting takes affect only after server restart.
   * @since 25.1
   */
  merge_tree_use_v1_object_and_dynamic_serialization?: boolean;

  /**
   * If enabled, some of the perf events will be measured throughout queries' execution.
   */
  metrics_perf_events_enabled?: boolean;

  /**
   * Comma separated list of perf metrics that will be measured throughout queries' execution. Empty means all events. See PerfEventInfo in sources for the available events.
   */
  metrics_perf_events_list?: string;

  /**
   * Used in workload scheduling. The minimum amount of bytes to spill. This setting takes effect only if MEMORY RESERVATION resource is created.
   * @since 26.11
   */
  min_bytes_to_spill?: bigint;

  /**
   * The minimum data volume required for using direct I/O access to the storage disk. ClickHouse uses this setting when reading data from tables. If the total storage volume of all the data to be read exceeds `min_bytes_to_use_direct_io` bytes, then ClickHouse reads the data from the storage disk with the `O_DIRECT` option. Possible values: - 0 — Direct I/O is disabled. - Positive integer.
   */
  min_bytes_to_use_direct_io?: bigint;

  /**
   * This is an experimental setting. Sets the minimum amount of memory for reading large files without copying data from the kernel to userspace. Recommended threshold is about 64 MB, because [mmap/munmap](https://en.wikipedia.org/wiki/Mmap) is slow. It makes sense only for large files and helps only if data reside in the page cache. Possible values: - Positive integer. - 0 — Big files read with only copying data from kernel to userspace.
   */
  min_bytes_to_use_mmap_io?: bigint;

  /**
   * - Type: unsigned int - Default value: 1 MiB The minimum chunk size in bytes, which each thread will parse in parallel.
   */
  min_chunk_bytes_for_parallel_parsing?: bigint;

  /**
   * For [MergeTree](/reference/engines/table-engines/mergetree-family/mergetree) tables. In order to reduce latency when processing queries, a block is compressed when writing the next mark if its size is at least `min_compress_block_size`. By default, 65,536. The actual size of the block, if the uncompressed data is less than `max_compress_block_size`, is no less than this value and no less than the volume of data for one mark. Let's look at an example. Assume that `index_granularity` was set to 8192 during table creation. We are writing a UInt32-type column (4 bytes per value). When writing 8192 rows, the total will be 32 KB of data. Since min_compress_block_size = 65,536, a compressed block will be formed for every two marks. We are writing a URL column with the String type (average size of 60 bytes per value). When writing 8192 rows, the average will be slightly less than 500 KB of data. Since this is more than 65,536, a compressed block will be formed for each mark. In this case, when reading data from the disk in the range of a single mark, extra data won't be decompressed. <Note> This is an expert-level setting, and you shouldn't change it if you're just getting started with ClickHouse. </Note>
   */
  min_compress_block_size?: bigint;

  /**
   * The minimum number of identical aggregate expressions to start JIT-compilation. Works only if the [compile_aggregate_expressions](#compile_aggregate_expressions) setting is enabled. Possible values: - Positive integer. - 0 — Identical aggregate expressions are always JIT-compiled.
   */
  min_count_to_compile_aggregate_expression?: bigint;

  /**
   * Minimum count of executing same expression before it is get compiled.
   */
  min_count_to_compile_expression?: bigint;

  /**
   * Minimum count of executing same regular expression before it is get compiled.
   * @since 26.8
   */
  min_count_to_compile_regular_expression?: bigint;

  /**
   * The number of identical sort descriptions before they are JIT-compiled
   */
  min_count_to_compile_sort_description?: bigint;

  /**
   * Minimal execution speed in rows per second. Checked on every data block when [`timeout_before_checking_execution_speed`](/reference/settings/session-settings/other#timeout_before_checking_execution_speed) expires. If the execution speed is lower, an exception is thrown.
   */
  min_execution_speed?: bigint;

  /**
   * The minimum number of execution bytes per second. Checked on every data block when [`timeout_before_checking_execution_speed`](/reference/settings/session-settings/other#timeout_before_checking_execution_speed) expires. If the execution speed is lower, an exception is thrown.
   */
  min_execution_speed_bytes?: bigint;

  /**
   * Squash blocks passed to the external table to a specified size in bytes, if blocks are not big enough.
   */
  min_external_table_block_size_bytes?: bigint;

  /**
   * Squash blocks passed to external table to specified size in rows, if blocks are not big enough.
   */
  min_external_table_block_size_rows?: bigint;

  /**
   * Minimum ratio of marks filtered by index analysis for lazy FINAL optimization. If less than this fraction of marks is filtered, falls back to normal FINAL. Value 0 disables this check.
   * @since 26.5
   */
  min_filtered_ratio_for_lazy_final?: number;

  /**
   * Minimum free disk space bytes to perform an insert.
   */
  min_free_disk_bytes_to_perform_insert?: bigint;

  /**
   * Minimum free disk space ratio to perform an insert.
   */
  min_free_disk_ratio_to_perform_insert?: number;

  /**
   * The minimum disk space to keep while writing temporary data used in external sorting and aggregation.
   */
  min_free_disk_space_for_temporary_data?: bigint;

  /**
   * Minimal hit rate of a cache which is used for consecutive keys optimization in aggregation to keep it enabled
   */
  min_hit_rate_to_use_consecutive_keys_optimization?: number;

  /**
   * The minimum size of blocks (in bytes) to form for insertion into a table. This setting works together with min_insert_block_size_rows and controls block formation in the same contexts (format parsing and INSERT operations). See min_insert_block_size_rows for detailed information about when and how these settings are applied. Possible values: - Positive integer. - 0 — setting does not participate in block formation.
   */
  min_insert_block_size_bytes?: bigint;

  /**
   * Sets the minimum number of bytes in the block which can be inserted into a table by an `INSERT` query. Smaller-sized blocks are squashed into bigger ones. This setting is applied only for blocks inserted into [materialized view](/reference/statements/create/view). By adjusting this setting, you control blocks squashing while pushing to materialized view and avoid excessive memory usage. Possible values: - Any positive integer. - 0 — Squashing disabled. **See also** - [min_insert_block_size_bytes](#min_insert_block_size_bytes)
   */
  min_insert_block_size_bytes_for_materialized_views?: bigint;

  /**
   * The minimum size of blocks (in rows) to form for insertion into a table. This setting controls block formation in two contexts: 1. Format parsing: When the server parses row-based input formats (CSV, TSV, JSONEachRow, etc.) from any interface (HTTP, clickhouse-client with inline data, gRPC, PostgreSQL wire protocol), blocks are emitted when: - Both min_insert_block_size_rows AND min_insert_block_size_bytes are reached, OR - Either max_insert_block_size_rows OR max_insert_block_size_bytes is reached Note: When using clickhouse-client or clickhouse-local to read from a file, the client itself parses the data and this setting applies on the client side. 2. INSERT operations: During INSERT queries and when data flows through materialized views, this setting's behavior depends on `use_strict_insert_block_limits`: - When enabled: Blocks are emitted when: - Min thresholds (AND): Both min_insert_block_size_rows AND min_insert_block_size_bytes are reached - Max thresholds (OR): Either max_insert_block_size_rows OR max_insert_block_size_bytes is reached - When disabled (default): Blocks are emitted when min_insert_block_size_rows OR min_insert_block_size_bytes is reached. The max_insert_block_size settings are not enforced. Possible values: - Positive integer. - 0 — setting does not participate in block formation.
   */
  min_insert_block_size_rows?: bigint;

  /**
   * Sets the minimum number of rows in the block which can be inserted into a table by an `INSERT` query. Smaller-sized blocks are squashed into bigger ones. This setting is applied only for blocks inserted into [materialized view](/reference/statements/create/view). By adjusting this setting, you control blocks squashing while pushing to materialized view and avoid excessive memory usage. Possible values: - Any positive integer. - 0 — Squashing disabled. **See Also** - [min_insert_block_size_rows](#min_insert_block_size_rows)
   */
  min_insert_block_size_rows_for_materialized_views?: bigint;

  /**
   * Minimum block size in bytes for JOIN input and output blocks (if join algorithm supports it). Small blocks will be squashed. 0 means unlimited.
   * @since 24.12
   */
  min_joined_block_size_bytes?: bigint;

  /**
   * Minimum block size in rows for JOIN input and output blocks (if join algorithm supports it). Small blocks will be squashed. 0 means unlimited.
   * @since 25.8
   */
  min_joined_block_size_rows?: bigint;

  /**
   * Specifies the minimum number of output streams of a `Resize` or `StrictResize` processor after the split is performed during pipeline generation. If the resulting number of streams is less than this value, the split operation will not occur. ### What is a Resize Node A `Resize` node is a processor in the query pipeline that adjusts the number of data streams flowing through the pipeline. It can either increase or decrease the number of streams to balance the workload across multiple threads or processors. For example, if a query requires more parallelism, the `Resize` node can split a single stream into multiple streams. Conversely, it can merge multiple streams into fewer streams to consolidate data processing. The `Resize` node ensures that data is evenly distributed across streams, maintaining the structure of the data blocks. This helps optimize resource utilization and improve query performance. ### Why the Resize Node Needs to Be Split During pipeline execution, ExecutingGraph::Node::status_mutex of the centrally-hubbed `Resize` node is heavily contended especially in high-core-count environments, and this contention leads to: 1. Increased latency for ExecutingGraph::updateNode, directly impacting query performance. 2. Excessive CPU cycles are wasted in spin-lock contention (native_queued_spin_lock_slowpath), degrading efficiency. 3. Reduced CPU utilization, limiting parallelism and throughput. ### How the Resize Node Gets Split 1. The number of output streams is checked to ensure the split could be performed: the output streams of each split processor meet or exceed the `min_outstreams_per_resize_after_split` threshold. 2. The `Resize` node is divided into smaller `Resize` nodes with equal count of ports, each handling a subset of input and output streams. 3. Each group is processed independently, reducing the lock contention. ### Splitting Resize Node with Arbitrary Inputs/Outputs In some cases, where the inputs/outputs are indivisible by the number of split `Resize` nodes, some inputs are connected to `NullSource`s and some outputs are connected to `NullSink`s. This allows the split to occur without affecting the overall data flow. ### Purpose of the Setting The `min_outstreams_per_resize_after_split` setting ensures that the splitting of `Resize` nodes is meaningful and avoids creating too few streams, which could lead to inefficient parallel processing. By enforcing a minimum number of output streams, this setting helps maintain a balance between parallelism and overhead, optimizing query execution in scenarios involving stream splitting and merging. ### Disabling the Setting To disable the split of `Resize` nodes, set this setting to 0. This will prevent the splitting of `Resize` nodes during pipeline generation, allowing them to retain their original structure without division into smaller nodes.
   * @since 25.7
   */
  min_outstreams_per_resize_after_split?: bigint;

  /**
   * Minimum estimated ratio of join output rows to build-side rows to enable transforming hash join payload to row-major. 0 means the transformation is always allowed.
   * @since 26.10
   */
  min_rows_ratio_for_hash_join_row_store?: number;

  /**
   * If the estimated number of rows to read from the table is greater than or equal to this threshold, ClickHouse will try to use the projection index during query execution.
   * @since 25.12
   */
  min_table_rows_to_use_projection_index?: bigint;

  /**
   * If enabled, MongoDB tables will return an error when a MongoDB query cannot be built. Otherwise, ClickHouse reads the full table and processes it locally.
   */
  mongodb_throw_on_unsupported_query?: boolean;

  /**
   * Move all viable conditions from WHERE to PREWHERE
   */
  move_all_conditions_to_prewhere?: boolean;

  /**
   * Move PREWHERE conditions containing primary key columns to the end of AND chain. It is likely that these conditions are taken into account during primary key analysis and thus will not contribute a lot to PREWHERE filtering.
   */
  move_primary_key_columns_to_end_of_prewhere?: boolean;

  /**
   * Do not add aliases to top level expression list on multiple joins rewrite
   */
  multiple_joins_try_to_keep_original_names?: boolean;

  /**
   * If true constant nondeterministic functions (e.g. function `now()`) are executed on initiator and replaced to literals in `UPDATE` and `DELETE` queries. It helps to keep data in sync on replicas while executing mutations with constant nondeterministic functions. Default value: `false`.
   */
  mutations_execute_nondeterministic_on_initiator?: boolean;

  /**
   * If true scalar subqueries are executed on initiator and replaced to literals in `UPDATE` and `DELETE` queries. Default value: `false`.
   */
  mutations_execute_subqueries_on_initiator?: boolean;

  /**
   * The maximum size of serialized literal in bytes to replace in `UPDATE` and `DELETE` queries. Takes effect only if at least one the two settings above is enabled. Default value: 16384 (16 KiB).
   */
  mutations_max_literal_size_to_replace?: bigint;

  /**
   * Controls how the client waits for mutations created by [`ALTER TABLE`](/reference/statements/alter/index) operations such as `UPDATE`, `DELETE`, `MATERIALIZE INDEX`, `MATERIALIZE PROJECTION`, `MATERIALIZE COLUMN`, and `MATERIALIZE STATISTICS`. Possible values: | Value | Description | |-------|-------------------------------------------------------------------------------------------------------------------------------------------------------| | `0` | Mutations execute asynchronously. | | `1` | The query waits for all mutations to complete on the current server. | | `2` | The query waits for all mutations to complete on all replicas (if they exist). | | `3` | The query waits only for the active replicas. Inactive replicas apply the mutations when they become active. |
   */
  mutations_sync?: bigint;

  /**
   * When enabled, [FixedString](/reference/data-types/fixedstring) ClickHouse data type will be displayed as `TEXT` in [SHOW COLUMNS](/reference/statements/show#show_columns). Has an effect only when the connection is made through the MySQL wire protocol. - 0 - Use `BLOB`. - 1 - Use `TEXT`.
   */
  mysql_map_fixed_string_to_text_in_show_columns?: boolean;

  /**
   * When enabled, [String](/reference/data-types/string) ClickHouse data type will be displayed as `TEXT` in [SHOW COLUMNS](/reference/statements/show#show_columns). Has an effect only when the connection is made through the MySQL wire protocol. - 0 - Use `BLOB`. - 1 - Use `TEXT`.
   */
  mysql_map_string_to_text_in_show_columns?: boolean;

  /**
   * The maximum number of rows in MySQL batch insertion of the MySQL storage engine
   */
  mysql_max_rows_to_insert?: bigint;

  /**
   * The codec for compressing the client/server and server/server communication over the native protocol, the response of an HTTP request made with `compress=1`, which uses the same frame format, and the streaming exchange between the tasks of a distributed query plan (`make_distributed_plan`). Exchanges through temporary files use the default codec of the server. Possible values: - `NONE` — no compression. - `LZ4` — use the LZ4 codec. - `LZ4HC` — use the LZ4HC codec. - `ZSTD` — use the ZSTD codec. **See Also** - [network_zstd_compression_level](#network_zstd_compression_level)
   */
  network_compression_method?: string;

  /**
   * Adjusts the level of ZSTD compression. Used only when [network_compression_method](#network_compression_method) is set to `ZSTD`. Possible values: - Positive integer from 1 to 15.
   */
  network_zstd_compression_level?: bigint;

  /**
   * Normalize function names to their canonical names
   */
  normalize_function_names?: boolean;

  /**
   * If the mutated table contains at least that many unfinished mutations, artificially slow down mutations of table. 0 - disabled
   */
  number_of_mutations_to_delay?: bigint;

  /**
   * If the mutated table contains at least that many unfinished mutations, throw 'Too many mutations ...' exception. 0 - disabled
   */
  number_of_mutations_to_throw?: bigint;

  /**
   * Size of the sliding window in the source string that is hashed to seed the RNG in the `obfuscate` table function's Markov model.
   * @since 26.11
   */
  obfuscate_markov_determinator_sliding_window_size?: bigint;

  /**
   * Constant added to every count in the `obfuscate` table function's Markov model to lower probability distribution skew.
   * @since 26.11
   */
  obfuscate_markov_frequency_add?: bigint;

  /**
   * Frequency cutoff for the Markov model used by the `obfuscate` table function: buckets with count less than this value are discarded.
   * @since 26.11
   */
  obfuscate_markov_frequency_cutoff?: bigint;

  /**
   * Value in `[0, 1]` that moves every frequency in the `obfuscate` table function's Markov model towards the average to lower probability distribution skew.
   * @since 26.11
   */
  obfuscate_markov_frequency_desaturate?: number;

  /**
   * Cutoff for the number of different possible continuations for a context in the `obfuscate` table function's Markov model: histograms with fewer buckets than this are discarded.
   * @since 26.11
   */
  obfuscate_markov_num_buckets_cutoff?: bigint;

  /**
   * Maximum context-buffer size used by the legacy Markov model for the `obfuscate` table function. The model records contexts shorter than this value, preserving the semantics of the standalone `clickhouse obfuscator` tool. Must be in the range `[1, 1000]`.
   * @since 26.11
   */
  obfuscate_markov_order?: bigint;

  /**
   * Seed for the `obfuscate` table function. Arbitrary string — the seed for each column is derived from it and the column name, so the same seed always produces the same obfuscation. Empty string means a random seed is generated for each query. The seed is an ordinary setting, not a secret: its value is stored and shown in plain text like any other setting, for example in `system.query_log` and `system.settings`. Do not use a password or another secret as the seed. If the obfuscated outputs of different queries must not be correlatable with each other, keep the default empty value (a fresh random seed per query) instead of setting a fixed seed.
   * @since 26.11
   */
  obfuscate_seed?: string;

  /**
   * Connection pool size for each connection settings string in ODBC bridge.
   */
  odbc_bridge_connection_pool_size?: bigint;

  /**
   * Use connection pooling in ODBC bridge. If set to false, a new connection is created every time.
   */
  odbc_bridge_use_connection_pooling?: boolean;

  /**
   * Sets the number of rows to skip before starting to return rows from the query. It adjusts the offset set by the [OFFSET](/reference/statements/select/offset) clause. The value is passed through to `OFFSET` and accepts everything that `OFFSET` accepts, including negative values and fractions in `(0, 1)`. Possible values: - 0 — No rows are skipped. - Positive integer. - Negative integer. - A real number in the open range `(0, 1)` — skip that fraction of the result. **Example** Input table: ```sql CREATE TABLE test (i UInt64) ENGINE = MergeTree() ORDER BY i; INSERT INTO test SELECT number FROM numbers(500); ``` Query: ```sql SET limit = 5; SET offset = 7; SELECT * FROM test LIMIT 10 OFFSET 100; ``` Result: ```text ┌───i─┐ │ 107 │ │ 108 │ │ 109 │ └─────┘ ``` This setting shapes result-producing `SELECT` / `UNION` queries. For a write query (`INSERT … SELECT`, `CREATE … AS SELECT`) it takes effect only when the source `SELECT` carries it in its own `SETTINGS` clause; a value inherited from a profile or session, or set on the `INSERT` / `CREATE` statement itself, does not propagate into the source `SELECT` — the same non-propagation rule that applies to any other setting.
   */
  offset?: number;

  /**
   * Probability to start a trace for ZooKeeper request - whether there is a parent trace or not. Possible values: - 'auto' - Equals the opentelemetry_start_trace_probability setting - 0 — Tracing is disabled - 0 to 1 — Probability (e.g., 1.0 = always enable)
   * @since 26.3
   */
  opentelemetry_start_keeper_trace_probability?: string;

  /**
   * Sets the probability that the ClickHouse can start a trace for executed queries (if no parent [trace context](https://www.w3.org/TR/trace-context/) is supplied). Possible values: - 0 — The trace for all executed queries is disabled (if no parent trace context is supplied). - Positive floating-point number in the range [0..1]. For example, if the setting value is `0,5`, ClickHouse can start a trace on average for half of the queries. - 1 — The trace for all executed queries is enabled.
   */
  opentelemetry_start_trace_probability?: number;

  /**
   * Collect OpenTelemetry spans for workload preemptive CPU scheduling.
   * @since 25.9
   */
  opentelemetry_trace_cpu_scheduling?: boolean;

  /**
   * Collect OpenTelemetry spans for processors.
   */
  opentelemetry_trace_processors?: boolean;

  /**
   * Only has an effect in ClickHouse Cloud. For a query that is itself being traced, collect OpenTelemetry spans for the stateless-worker discovery-service requests it makes to provision (lease) workers. The spans are named `StatelessWorkerDiscovery.<action>` and carry the attributes `clickhouse.discovery.action` and `clickhouse.discovery.status`.
   * @since 26.11
   */
  opentelemetry_trace_stateless_worker_discovery?: boolean;

  /**
   * Enables [GROUP BY](/reference/statements/select/group-by) optimization in [SELECT](/reference/statements/select/index) queries for aggregating data in corresponding order in [MergeTree](/reference/engines/table-engines/mergetree-family/mergetree) tables. Possible values: - 0 — `GROUP BY` optimization is disabled. - 1 — `GROUP BY` optimization is enabled. **See Also** - [GROUP BY optimization](/reference/statements/select/group-by#group-by-optimization-depending-on-table-sorting-key)
   */
  optimize_aggregation_in_order?: boolean;

  /**
   * When enabled and aggregation in order is active, pushes LIMIT into the aggregation step to enable early termination after producing enough groups. This reduces the amount of data read when ORDER BY matches the GROUP BY key prefix. May reduce the value reported by `rows_before_limit_at_least`; use `exact_rows_before_limit` if exact counts are needed.
   * @since 26.8
   */
  optimize_aggregation_in_order_limit?: boolean;

  /**
   * Eliminates min/max/any/anyLast aggregators of GROUP BY keys in SELECT section
   */
  optimize_aggregators_of_group_by_keys?: boolean;

  /**
   * Populate constant comparison in AND chains to enhance filtering ability. Support operators `<`, `<=`, `>`, `>=`, `=` and mix of them. For example, `(a < b) AND (b < c) AND (c < 5)` would be `(a < b) AND (b < c) AND (c < 5) AND indexHint(b < 5) AND indexHint(a < 5)`. The derived comparisons are wrapped in `indexHint`: they participate in index analysis (primary key, partition key, skipping indexes) and prune the read set, but cost nothing per row and do not affect PREWHERE. A comparison derived through expressions of different tables stays executable (`(t1.a < t2.b) AND (t2.b < 5)` derives plain `t1.a < 5`): it is the only condition that can be pushed below the join, where it filters a join input the original chain cannot reach. Derived comparisons that contradict an existing condition are also added as plain conditions, so the `AND` folds to `false`.
   * @since 25.3
   */
  optimize_and_compare_chain?: boolean;

  /**
   * Work budget for the `optimize_and_compare_chain` optimization during query analysis, measured in the number of query-tree nodes hashed by `getTreeHash` (the dominant cost of this optimization). Once a query has hashed more than this many nodes while applying the optimization, it stops applying it for the rest of the query. This bounds analysis time for queries with very many or very large `AND`-chains of comparisons, where the optimization can otherwise dominate analysis while folding nothing. Stopping early is always safe: it only forgoes an optimization and never changes results. Set to `0` to disable the budget (unlimited).
   * @since 26.8
   */
  optimize_and_compare_chain_max_hash_work?: bigint;

  /**
   * Use [constraints](/reference/statements/create/table#constraints) in order to append index condition. The default is `false`. Possible values: - true, false
   */
  optimize_append_index?: boolean;

  /**
   * Move arithmetic operations out of aggregation functions
   */
  optimize_arithmetic_operations_in_aggregate_functions?: boolean;

  /**
   * Replace with scalar and use hash as a name for large constants (size is estimated by the name length). Possible values: - positive integer - max length of the name, - 0 — always, - negative integer - never.
   * @since 25.12
   */
  optimize_const_name_size?: bigint;

  /**
   * Enables or disables the optimization of counting number of rows from files in different input formats. It applies to table functions/engines `file`/`s3`/`url`/`hdfs`/`azureBlobStorage`. Possible values: - 0 — Optimization disabled. - 1 — Optimization enabled.
   */
  optimize_count_from_files?: boolean;

  /**
   * Rewrite `tupleElement(dictGet('dict', ('a', 'b', 'c'), key), 2)` into `dictGet('dict', 'b', key)` to avoid fetching unnecessary dictionary attributes. Supports positional (`.1`, `.2`, ...) and named (`.b`) access, and also applies to `dictGetOrDefault` when the default argument is a constant tuple or a `tuple(...)` of constants.
   * @since 26.6
   */
  optimize_dictget_tuple_element?: boolean;

  /**
   * Enable DISTINCT optimization if some columns in DISTINCT form a prefix of sorting. For example, prefix of sorting key in merge tree or ORDER BY statement
   */
  optimize_distinct_in_order?: boolean;

  /**
   * Optimize `GROUP BY sharding_key` queries, by avoiding costly aggregation on the initiator server (which will reduce memory usage for the query on the initiator server). The following types of queries are supported (and all combinations of them): - `SELECT DISTINCT [..., ]sharding_key[, ...] FROM dist` - `SELECT ... FROM dist GROUP BY sharding_key[, ...]` - `SELECT ... FROM dist GROUP BY sharding_key[, ...] ORDER BY x` - `SELECT ... FROM dist GROUP BY sharding_key[, ...] LIMIT 1` - `SELECT ... FROM dist GROUP BY sharding_key[, ...] LIMIT 1 BY x` The following types of queries are not supported (support for some of them may be added later): - `SELECT ... GROUP BY sharding_key[, ...] WITH TOTALS` - `SELECT ... GROUP BY sharding_key[, ...] WITH ROLLUP` - `SELECT ... GROUP BY sharding_key[, ...] WITH CUBE` - `SELECT ... GROUP BY sharding_key[, ...] SETTINGS extremes=1` Possible values: - 0 — Disabled. - 1 — Enabled. See also: - [distributed_group_by_no_merge](#distributed_group_by_no_merge) - [distributed_push_down_limit](#distributed_push_down_limit) - [optimize_skip_unused_shards](#optimize_skip_unused_shards) <Note> Right now it requires `optimize_skip_unused_shards` (the reason behind this is that one day it may be enabled by default, and it will work correctly only if data was inserted via Distributed table, i.e. data is distributed according to sharding_key). </Note>
   */
  optimize_distributed_group_by_sharding_key?: boolean;

  /**
   * When enabled, `OPTIMIZE ... DRY RUN` validates the resulting merged part using `checkDataPart`. If the check fails, an exception is thrown.
   * @since 26.3
   */
  optimize_dry_run_check_part?: boolean;

  /**
   * Convert expressions like col = '' or '' = col into empty(col), and col != '' or '' != col into notEmpty(col), only when col is of String or FixedString type.
   * @since 25.11
   */
  optimize_empty_string_comparisons?: boolean;

  /**
   * Allow extracting common expressions from disjunctions in WHERE, PREWHERE, ON, HAVING and QUALIFY expressions. A logical expression like `(A AND B) OR (A AND C)` can be rewritten to `A AND (B OR C)`, which might help to utilize: - indices in simple filtering expressions - cross to inner join optimization
   * @since 25.1
   */
  optimize_extract_common_expressions?: boolean;

  /**
   * Enables or disables optimization by transforming some functions to reading subcolumns. This reduces the amount of data to read. These functions can be transformed: - [length](/reference/functions/regular-functions/array-functions#length) to read the [size0](/reference/data-types/array#array-size) subcolumn. - [empty](/reference/functions/regular-functions/array-functions#empty) to read the [size0](/reference/data-types/array#array-size) subcolumn. - [notEmpty](/reference/functions/regular-functions/array-functions#notEmpty) to read the [size0](/reference/data-types/array#array-size) subcolumn. - [isNull](/reference/functions/regular-functions/functions-for-nulls#isNull) to read the [null](/reference/data-types/nullable#finding-null) subcolumn. - [isNotNull](/reference/functions/regular-functions/functions-for-nulls#isNotNull) to read the [null](/reference/data-types/nullable#finding-null) subcolumn. - [count](/reference/functions/aggregate-functions/count) to read the [null](/reference/data-types/nullable#finding-null) subcolumn. - [mapKeys](/reference/functions/regular-functions/tuple-map-functions#mapKeys) to read the [keys](/reference/data-types/map#reading-subcolumns-of-map) subcolumn. - [mapValues](/reference/functions/regular-functions/tuple-map-functions#mapValues) to read the [values](/reference/data-types/map#reading-subcolumns-of-map) subcolumn. - [has](/reference/functions/regular-functions/array-functions#has) and [notHas](/reference/functions/regular-functions/array-functions#notHas) for `Map` to read the [keys](/reference/data-types/map#reading-subcolumns-of-map) subcolumn. - [mapContainsKeyLike](/reference/functions/regular-functions/tuple-map-functions#mapContainsKeyLike) to read the [keys](/reference/data-types/map#reading-subcolumns-of-map) subcolumn. - [mapContainsValueLike](/reference/functions/regular-functions/tuple-map-functions#mapContainsValueLike) to read the [values](/reference/data-types/map#reading-subcolumns-of-map) subcolumn. Possible values: - 0 — Optimization disabled. - 1 — Optimization enabled.
   */
  optimize_functions_to_subcolumns?: boolean;

  /**
   * Optimize GROUP BY when all keys in block are constant
   */
  optimize_group_by_constant_keys?: boolean;

  /**
   * Eliminates functions of other keys in GROUP BY section
   */
  optimize_group_by_function_keys?: boolean;

  /**
   * Replace if(cond1, then1, if(cond2, ...)) chains to multiIf. Currently it's not beneficial for numeric types.
   */
  optimize_if_chain_to_multiif?: boolean;

  /**
   * Replaces string-type arguments in If and Transform to enum. Disabled by default cause it could make inconsistent change in distributed query that would lead to its fail.
   */
  optimize_if_transform_strings_to_enum?: boolean;

  /**
   * Replaces injective functions by it's arguments in GROUP BY section
   */
  optimize_injective_functions_in_group_by?: boolean;

  /**
   * Replaces injective functions by their arguments in LIMIT BY section. Example: `LIMIT 5 BY toString(x)` becomes `LIMIT 5 BY x`.
   * @since 26.7
   */
  optimize_injective_functions_in_limit_by?: boolean;

  /**
   * Delete injective functions of one argument inside uniq*() functions.
   */
  optimize_injective_functions_inside_uniq?: boolean;

  /**
   * Avoid repeated inverse dictionary lookup by doing faster lookups into a precomputed set of possible key values.
   * @since 26.1
   */
  optimize_inverse_dictionary_lookup?: boolean;

  /**
   * Eliminates functions of other keys in LIMIT BY section. Example: `LIMIT 5 BY x, f(x)` becomes `LIMIT 5 BY x`.
   * @since 26.7
   */
  optimize_limit_by_function_keys?: boolean;

  /**
   * Optimize `SELECT ... LIMIT N BY <cols>` queries when `<cols>` (in any order) form a prefix of the table's sorting key, or become one after `WHERE col = const` fixes leading columns. With this enabled the source reads data in primary-key order, so rows with equal values of the `BY` columns arrive adjacent to each other within each stream. When the data arrives in a single sorted stream, `LIMIT BY` filters it in streaming mode with O(1) memory, instead of building a hash table of every distinct combination of `BY` columns seen. When the sorted data arrives in multiple streams and the same `BY` values can appear in more than one of them, each stream is first prefiltered in streaming mode down to at most `LIMIT + OFFSET` rows per group, then the streams are combined and a final hash-based `LIMIT BY` deduplicates groups that span several streams. That final pass still keeps an entry for every distinct combination of `BY` columns, but it only processes the prefiltered rows.
   * @since 26.7
   */
  optimize_limit_by_in_order?: boolean;

  /**
   * The minimum length of the expression `expr = x1 OR ... expr = xN` for optimization
   */
  optimize_min_equality_disjunction_chain_length?: bigint;

  /**
   * The minimum length of the expression `expr <> x1 AND ... expr <> xN` for optimization
   */
  optimize_min_inequality_conjunction_chain_length?: bigint;

  /**
   * Enables or disables computing `min` and `max` of columns from the statistics stored in data files instead of reading the data, for queries whose only aggregate functions are `min` and `max` of table columns, without `GROUP BY` and without filters. It applies to the table function/engine `file` with the `Parquet` format (not to files inside archives), for integer (up to 64 bits), date, date-time and decimal columns whose column chunk statistics are present in every row group. Possible values: - 0 - Optimization disabled. - 1 - Optimization enabled.
   * @since 26.11
   */
  optimize_min_max_from_files?: boolean;

  /**
   * Enables or disables automatic [PREWHERE](/reference/statements/select/prewhere) optimization in [SELECT](/reference/statements/select/index) queries. Works only for [*MergeTree](/reference/engines/table-engines/mergetree-family/index) tables. Possible values: - 0 — Automatic `PREWHERE` optimization is disabled. - 1 — Automatic `PREWHERE` optimization is enabled.
   */
  optimize_move_to_prewhere?: boolean;

  /**
   * Enables or disables automatic [PREWHERE](/reference/statements/select/prewhere) optimization in [SELECT](/reference/statements/select/index) queries with [FINAL](/reference/statements/select/from#final-modifier) modifier. Only conditions that depend on the sorting key alone and are deterministic within the query are moved, so the result of `FINAL` is not affected. Works only for [*MergeTree](/reference/engines/table-engines/mergetree-family/index) tables. Possible values: - 0 — Automatic `PREWHERE` optimization in `SELECT` queries with `FINAL` modifier is disabled. - 1 — Automatic `PREWHERE` optimization in `SELECT` queries with `FINAL` modifier is enabled. **See Also** - [optimize_move_to_prewhere](#optimize_move_to_prewhere) setting
   */
  optimize_move_to_prewhere_if_final?: boolean;

  /**
   * Replace 'multiIf' with only one condition to 'if'.
   */
  optimize_multiif_to_if?: boolean;

  /**
   * When enabled, ClickHouse automatically detects partition key conditions in the WHERE clause of `ALTER TABLE UPDATE`/`DELETE` mutations and lightweight `UPDATE`/`DELETE` statements on tables of the `ReplicatedMergeTree` family and only processes the affected partitions instead of all partitions. This automatic pruning currently applies only to replicated tables. On non-replicated `MergeTree` tables, use an explicit `IN PARTITION` clause to limit a mutation to specific partitions. Possible values: - 0 — Disabled. Mutations and lightweight updates will process all partitions. - 1 — Enabled. Mutations and lightweight updates will only process partitions that match the WHERE condition.
   * @since 26.10
   */
  optimize_mutations_with_partition_pruning?: boolean;

  /**
   * Rewrite aggregate functions that semantically equals to count() as count().
   */
  optimize_normalize_count_variants?: boolean;

  /**
   * Enables or disables data transformation before the insertion, as if merge was done on this block (according to table engine). Possible values: - 0 — Disabled. - 1 — Enabled. **Example** The difference between enabled and disabled: Query: ```sql SET optimize_on_insert = 1; CREATE TABLE test1 (`FirstTable` UInt32) ENGINE = ReplacingMergeTree ORDER BY FirstTable; INSERT INTO test1 SELECT number % 2 FROM numbers(5); SELECT * FROM test1; SET optimize_on_insert = 0; CREATE TABLE test2 (`SecondTable` UInt32) ENGINE = ReplacingMergeTree ORDER BY SecondTable; INSERT INTO test2 SELECT number % 2 FROM numbers(5); SELECT * FROM test2; ``` Result: ```text ┌─FirstTable─┐ │ 0 │ │ 1 │ └────────────┘ ┌─SecondTable─┐ │ 0 │ │ 0 │ │ 0 │ │ 1 │ │ 1 │ └─────────────┘ ``` Note that this setting influences [Materialized view](/reference/statements/create/view#materialized-view) behaviour.
   */
  optimize_on_insert?: boolean;

  /**
   * Optimize multiple `OR LIKE/ILIKE/match` predicates on the same expression into a single `multiSearchAny`/`multiSearchAnyCaseInsensitiveUTF8` (for pure-substring `%needle%` patterns) or `multiMatchAny` (for other patterns, when Hyperscan/Vectorscan is permitted). When neither fast path is applicable — for example when Hyperscan is disabled or unavailable, or the patterns are raw `match` regexps, not valid UTF-8, contain an embedded NUL, are end-anchored (do not end in an unescaped `%`; Vectorscan matches `$` before a final newline, so the rewrite would widen the filter), or the haystack is `FixedString`/`Enum` — the original `OR` chain is kept unchanged, because a combined `match` alternation over RE2 is consistently slower than the original short-circuit `OR`. For pure `LIKE`/`ILIKE`/`match` `OR` chains the original expressions are preserved in `indexHint()` to allow index analysis; mixed `OR` chains that include non-`LIKE` branches intentionally skip `indexHint()` wrapping so that ranges matching only the non-`LIKE` branch are not pruned. The `multiMatchAny` rewrite honors `allow_hyperscan`, `max_hyperscan_regexp_length`, `max_hyperscan_regexp_total_length` and `reject_expensive_hyperscan_regexps`. A chain is rewritten only when it has enough branches sharing the same left-hand-side expression to make the rewrite reliably faster than short-circuit `OR` evaluation: at least `optimize_or_like_chain_min_substrings` branches for the `multiSearchAny` path, and at least `optimize_or_like_chain_min_patterns` branches for the `multiMatchAny` path.
   */
  optimize_or_like_chain?: boolean;

  /**
   * Minimum number of non-pure-substring `LIKE`/`ILIKE`/`match` branches (prefix/suffix/regexp patterns), sharing the same left-hand-side expression, required for `optimize_or_like_chain` to rewrite a chain into `multiMatchAny`. Calibrated on the `hits` dataset (see `tests/performance/optimize_or_like_chain_hits.xml`): a `multiMatchAny` (Hyperscan) rewrite of prefix/regexp `LIKE` chains only becomes faster than short-circuit `OR` evaluation from about nine branches, so shorter chains are kept as-is to avoid regressing them. A value of 0 or 1 disables the threshold. Has no effect when `optimize_or_like_chain` is disabled. See also `optimize_or_like_chain_min_substrings` for the pure-substring (`multiSearchAny`) path.
   * @since 26.8
   */
  optimize_or_like_chain_min_patterns?: bigint;

  /**
   * Minimum number of pure-substring (`%needle%`) `LIKE`/`ILIKE` branches, sharing the same left-hand-side expression, required for `optimize_or_like_chain` to rewrite a chain into `multiSearchAny`/`multiSearchAnyCaseInsensitiveUTF8`. Calibrated on the `hits` dataset (see `tests/performance/optimize_or_like_chain_hits.xml`): the `multiSearchAny` rewrite becomes faster than short-circuit `OR` evaluation from about four branches. A value of 0 or 1 disables the threshold. Has no effect when `optimize_or_like_chain` is disabled. See also `optimize_or_like_chain_min_patterns` for the regexp (`multiMatchAny`) path.
   * @since 26.8
   */
  optimize_or_like_chain_min_substrings?: bigint;

  /**
   * Run a second `PREWHERE` promotion pass after later query plan optimizations may have deposited additional filters above a `MergeTree` read step (e.g. predicate pushdown through `JOIN`, projection rewrites). When an existing `PREWHERE` is already present, the new filter is `AND`-merged into it instead of staying as a separate filter step.
   * @since 26.7
   */
  optimize_prewhere_after_pushdown?: boolean;

  /**
   * Replace distance functions on `QBit` data type with equivalent ones that only read the columns necessary for the calculation from the storage.
   * @since 25.11
   */
  optimize_qbit_distance_function_reads?: boolean;

  /**
   * Enables [ORDER BY](/reference/statements/select/order-by#optimization-of-data-reading) optimization in [SELECT](/reference/statements/select/index) queries for reading data from [MergeTree](/reference/engines/table-engines/mergetree-family/mergetree) tables. Possible values: - 0 — `ORDER BY` optimization is disabled. - 1 — `ORDER BY` optimization is enabled. **See Also** - [ORDER BY Clause](/reference/statements/select/order-by#optimization-of-data-reading)
   */
  optimize_read_in_order?: boolean;

  /**
   * Enables reading data in reverse order of the sorting key in `SELECT` queries with the `FINAL` modifier from [ReplacingMergeTree](../../engines/table-engines/mergetree-family/replacingmergetree.md) tables, and from [Merge](../../engines/table-engines/special/merge.md) tables when every underlying table supports it. Takes effect only when [optimize_read_in_order](#optimize_read_in_order) is also enabled. Possible values: - 0 — Reading in reverse order with `FINAL` is disabled. - 1 — Reading in reverse order with `FINAL` is enabled.
   * @since 26.10
   */
  optimize_read_in_reverse_order_final?: boolean;

  /**
   * Detect conflicting and redundant comparison conditions on the same expression within AND chains. For example, `a < 1 AND a > 5` would be rewritten to `false`. A contradiction between two `equals` on the same expression (for example, `a = 1 AND a = 2`) is detected independently of this setting.
   * @since 26.8
   */
  optimize_redundant_comparisons?: boolean;

  /**
   * Remove functions from ORDER BY if its argument is also in ORDER BY
   */
  optimize_redundant_functions_in_order_by?: boolean;

  /**
   * If it is set to true, it will respect aliases in WHERE/GROUP BY/ORDER BY, that will help with partition pruning/secondary indexes/optimize_aggregation_in_order/optimize_read_in_order/optimize_trivial_count
   */
  optimize_respect_aliases?: boolean;

  /**
   * Rewrite aggregate functions with if expression as argument when logically equivalent. For example, `avg(if(cond, col, null))` can be rewritten to `avgOrNullIf(cond, col)`. It may improve performance.
   */
  optimize_rewrite_aggregate_function_with_if?: boolean;

  /**
   * Rewrite arrayExists() functions to has() when logically equivalent. For example, arrayExists(x -> x = 1, arr) can be rewritten to has(arr, 1)
   */
  optimize_rewrite_array_exists_to_has?: boolean;

  /**
   * Rewrite `length(arrayFilter(func, arr))` to `arrayCount(func, arr)`. `arrayFilter` builds an array of the matching elements only for `length` to throw it away, while `arrayCount` just counts them.
   * @since 26.11
   */
  optimize_rewrite_array_filter_length_to_array_count?: boolean;

  /**
   * Rewrite `has` functions to `IN` when the first argument is a constant array. For example, `has([1, 2, 3], x)` can be rewritten to `x IN [1, 2, 3]` for better performance with constant arrays
   * @since 26.7
   */
  optimize_rewrite_has_to_in?: boolean;

  /**
   * Rewrite LIKE expressions with perfect prefix or suffix (e.g. `col LIKE 'ClickHouse%'`) to startsWith or endsWith functions (e.g. `startsWith(col, 'ClickHouse')`).
   * @since 25.11
   */
  optimize_rewrite_like_perfect_affix?: boolean;

  /**
   * Rewrite regular expression related functions into simpler and more efficient forms
   * @since 25.9
   */
  optimize_rewrite_regexp_functions?: boolean;

  /**
   * Rewrite sumIf() and sum(if()) function countIf() function when logically equivalent
   */
  optimize_rewrite_sum_if_to_count_if?: boolean;

  /**
   * Enables or disables optimization for [OPTIMIZE TABLE ... FINAL](/reference/statements/optimize) query if there is only one part with level > 0 and it doesn't have expired TTL. - `OPTIMIZE TABLE ... FINAL SETTINGS optimize_skip_merged_partitions=1` By default, `OPTIMIZE TABLE ... FINAL` query rewrites the one part even if there is only a single part. Possible values: - 1 - Enable optimization. - 0 - Disable optimization.
   */
  optimize_skip_merged_partitions?: boolean;

  /**
   * Enables or disables skipping of unused shards for [SELECT](/reference/statements/select/index) queries that have sharding key condition in `WHERE/PREWHERE`, and activates related optimizations for distributed queries (e.g. aggregation by sharding key). <Note> Assumes that the data is distributed by sharding key, otherwise a query yields incorrect result. </Note> Possible values: - 0 — Disabled. - 1 — Enabled.
   */
  optimize_skip_unused_shards?: boolean;

  /**
   * Limit for number of sharding key values, turns off `optimize_skip_unused_shards` if the limit is reached. Too many values may require significant amount for processing, while the benefit is doubtful, since if you have huge number of values in `IN (...)`, then most likely the query will be sent to all shards anyway.
   */
  optimize_skip_unused_shards_limit?: bigint;

  /**
   * Controls [`optimize_skip_unused_shards`](#optimize_skip_unused_shards) (hence still requires [`optimize_skip_unused_shards`](#optimize_skip_unused_shards)) depends on the nesting level of the distributed query (case when you have `Distributed` table that look into another `Distributed` table). Possible values: - 0 — Disabled, `optimize_skip_unused_shards` works always. - 1 — Enables `optimize_skip_unused_shards` only for the first level. - 2 — Enables `optimize_skip_unused_shards` up to the second level.
   */
  optimize_skip_unused_shards_nesting?: bigint;

  /**
   * Rewrite IN in query for remote shards to exclude values that does not belong to the shard (requires optimize_skip_unused_shards). Possible values: - 0 — Disabled. - 1 — Enabled.
   */
  optimize_skip_unused_shards_rewrite_in?: boolean;

  /**
   * Optimize sorting by sorting properties of input stream
   */
  optimize_sorting_by_input_stream_properties?: boolean;

  /**
   * Use [constraints](/reference/statements/create/table#constraints) for column substitution. The default is `false`. Possible values: - true, false
   */
  optimize_substitute_columns?: boolean;

  /**
   * Enables to fuse aggregate functions with identical argument. It rewrites query contains at least two aggregate functions from [sum](/reference/functions/aggregate-functions/sum), [count](/reference/functions/aggregate-functions/count) or [avg](/reference/functions/aggregate-functions/avg) with identical argument to [sumCount](/reference/functions/aggregate-functions/sumCount). Possible values: - 0 — Functions with identical argument are not fused. - 1 — Functions with identical argument are fused. **Example** Query: ```sql CREATE TABLE fuse_tbl(a Int8, b Int8) Engine = Log; SET optimize_syntax_fuse_functions = 1; EXPLAIN SYNTAX run_query_tree_passes = 1 SELECT sum(a), sum(b), count(b), avg(b) from fuse_tbl FORMAT TSVRaw; ``` Result: ```text SELECT sum(__table1.a) AS `sum(a)`, tupleElement(sumCount(__table1.b), 1) AS `sum(b)`, tupleElement(sumCount(__table1.b), 2) AS `count(b)`, divide(tupleElement(sumCount(__table1.b), 1), toFloat64(tupleElement(sumCount(__table1.b), 2))) AS `avg(b)` FROM default.fuse_tbl AS __table1 ```
   */
  optimize_syntax_fuse_functions?: boolean;

  /**
   * Enables or disables throwing an exception if an [OPTIMIZE](/reference/statements/optimize) query didn't perform a merge. By default, `OPTIMIZE` returns successfully even if it didn't do anything. This setting lets you differentiate these situations and get the reason in an exception message. Possible values: - 1 — Throwing an exception is enabled. - 0 — Throwing an exception is disabled.
   */
  optimize_throw_if_noop?: boolean;

  /**
   * Optimize Date and DateTime predicates by converting functions into equivalent comparisons without conversions (e.g. `toYear(col) = 2023 -> col >= '2023-01-01' AND col <= '2023-12-31'`)
   */
  optimize_time_filter_with_preimage?: boolean;

  /**
   * Use an approximate value for trivial count optimization of storages that support such estimation, for example, EmbeddedRocksDB. Possible values: - 0 — Optimization disabled. - 1 — Optimization enabled.
   */
  optimize_trivial_approximate_count_query?: boolean;

  /**
   * Enables or disables the optimization to trivial query `SELECT count() FROM table` using metadata from MergeTree. If you need to use row-level security, disable this setting. Possible values: - 0 — Optimization disabled. - 1 — Optimization enabled. See also: - [optimize_functions_to_subcolumns](#optimize_functions_to_subcolumns)
   */
  optimize_trivial_count_query?: boolean;

  /**
   * Extends the [optimize_trivial_count_query](#optimize_trivial_count_query) optimization to queries of the form `SELECT count() FROM t WHERE col <op> const`, where `<op> const` exactly partitions rows into defaults and non-defaults of `col`. The count is then served from the per-column `num_defaults` / `num_rows` counters that MergeTree already keeps in `serialization.json`, with no data scan. Patterns recognised: - `col = default(col)` / `col != default(col)` for `Int*` / `UInt*`, `String` / `FixedString`, `Date` / `DateTime` / `DateTime64`, `Decimal*`, `UUID`, `IPv4` / `IPv6`. - `IS NULL` / `IS NOT NULL` on `Nullable` columns. - `empty(col)` / `notEmpty(col)` on `String` columns. - `col = true` / `col != true` on `Bool` columns. - `col > 0`, `col >= 1`, `col < 1`, `col <= 0` on unsigned integer columns. - Bare `col` / `NOT col` on `Int*`, `UInt*`, `Bool` columns (truthy test). The equality patterns are not applied to `Float*`, `Enum*`, `Nullable`, `LowCardinality`, or composite types (`Tuple`, `Array`, `Map`, ...) — for these the count is served from the regular scan path. To take effect, the per-part `num_defaults` counter must be exact. Enable the MergeTree table setting `compute_exact_num_defaults_for_sparse_columns` on the target table before inserts and merges. Parts written without it are silently opted out of the rewrite, so enabling `optimize_trivial_count_with_sparsity_filter` alone is not enough. For the `IS NULL` / `IS NOT NULL` patterns on `Nullable` columns, the column must also have a `num_defaults` entry in `serialization.json`, which only happens when the MergeTree table setting `nullable_serialization_version` is set to `allow_sparse` at insert / merge time. With the default value `basic` `Nullable` columns get no per-column entry, so the optimization silently does not apply. Possible values: - 0 — Optimization disabled. - 1 — Optimization enabled. See also: - [optimize_trivial_count_query](#optimize_trivial_count_query)
   * @since 26.8
   */
  optimize_trivial_count_with_sparsity_filter?: boolean;

  /**
   * Enables or disables the optimization of a trivial query `SELECT ... FROM table GROUP BY key_expr LIMIT n` (with no `HAVING`/`ORDER BY`/`QUALIFY`/`LIMIT BY`/`DISTINCT`/window clauses and no `GROUP BY` modifiers) by capping the aggregation at `n + offset` distinct keys. With no aggregate functions in the projection, the cap is applied by setting `max_rows_to_group_by = n + offset` with `group_by_overflow_mode = 'any'` (this form also applies on the shards of distributed queries). With aggregate functions in the projection, the cap is applied only when the server performs the complete aggregation locally: once any aggregation thread exceeds the cap, all threads are restricted to a single shared set of `n + offset` kept keys, so the aggregate values of the returned keys stay exact. The optimization is suppressed when the user has explicitly set `group_by_overflow_mode` to a non-`any` value (to preserve their explicit `throw`/`break` contract), when the user has already set a tighter `max_rows_to_group_by`, and with [exact_rows_before_limit](#exact_rows_before_limit) (the cap would make `rows_before_limit_at_least` report at most `n + offset`). The aggregate-function form excludes the `GROUP BY` top-K heap of [enable_group_by_top_k_optimization](#enable_group_by_top_k_optimization) on the same query. The heap is faster, so the cutoff is applied only when the heap does not apply: when it is disabled, when `n + offset` exceeds [query_plan_max_limit_for_top_k_optimization](#query_plan_max_limit_for_top_k_optimization), when `max_rows_to_group_by` is set, or when the query plan is serialized. Possible values: - 0 — Optimization disabled. - 1 — Optimization enabled.
   * @since 26.6
   */
  optimize_trivial_group_by_limit_query?: boolean;

  /**
   * Optimize trivial 'INSERT INTO table SELECT ... FROM TABLES' query Pair this with an explicit `max_insert_threads` setting: the optimization caps the `SELECT` to `max_insert_threads` reading threads, which changes how many blocks the `SELECT` produces.
   */
  optimize_trivial_insert_select?: boolean;

  /**
   * When enabled, for views over [Distributed](../../engines/table-engines/special/distributed.md) tables whose `SELECT` list contains only column references, `*`, or expressions (but no window functions or scalar subqueries), and that have no aggregation, grouping, ordering, or joins, the full outer query is pushed to each shard. This allows the shard to apply the view's filters and expressions locally, reducing the amount of data transferred over the network. Possible values: - 0 — The optimization is disabled; views over `Distributed` tables are always executed on the coordinator. - 1 — The optimization is enabled.
   * @since 26.9
   */
  optimize_trivial_view_pushdown_to_distributed?: boolean;

  /**
   * Remove trailing ORDER BY elements once all GROUP BY keys are covered in the ORDER BY prefix.
   * @since 26.5
   */
  optimize_truncate_order_by_after_group_by_keys?: boolean;

  /**
   * Rewrite uniq and its variants(except uniqUpTo) to count if subquery has distinct or group by clause.
   */
  optimize_uniq_to_count?: boolean;

  /**
   * Automatically choose implicit projections to perform SELECT query
   */
  optimize_use_implicit_projections?: boolean;

  /**
   * Enables using projections to filter part ranges even when projections are not selected to perform SELECT query.
   * @since 25.7
   */
  optimize_use_projection_filtering?: boolean;

  /**
   * Enables or disables [projection](/reference/engines/table-engines/mergetree-family/mergetree#projections) optimization when processing `SELECT` queries. Possible values: - 0 — Projection optimization disabled. - 1 — Projection optimization enabled.
   */
  optimize_use_projections?: boolean;

  /**
   * Use [constraints](/reference/statements/create/table#constraints) for query optimization. The default is `false`. Possible values: - true, false
   */
  optimize_using_constraints?: boolean;

  /**
   * Adds an `ORDER BY` clause to the query as a wrapping subquery. Accepts an arbitrary expression list. This is a query-construction setting applied by the engine on the parsed query (wrapping it as a derived table), so it composes with the existing query and works on every protocol: it can be supplied via the HTTP URL parameter, an in-query `SETTINGS` clause, or a user profile. It shapes result-producing `SELECT` / `UNION` queries. For a write query (`INSERT … SELECT`, `CREATE … AS SELECT`) it takes effect only when the source `SELECT` carries it in its own `SETTINGS` clause; a value inherited from a profile or session, or set on the `INSERT` / `CREATE` statement itself, does not propagate into the source `SELECT` — the same non-propagation rule that applies to any other setting.
   * @since 26.9
   */
  order?: string;

  /**
   * Linux nice value for materialized view threads. Lower values mean higher CPU priority. Requires CAP_SYS_NICE capability, otherwise no-op. Possible values: -20 to 19.
   * @since 25.10
   */
  os_threads_nice_value_materialized_view?: string;

  /**
   * Linux nice value for query processing threads. Lower values mean higher CPU priority. Requires CAP_SYS_NICE capability, otherwise no-op. Possible values: -20 to 19.
   * @since 25.10
   */
  os_threads_nice_value_query?: string;

  /**
   * Overrides the output format of the query. Wins over the format specified in the query, in the file extension, or via `default_format`.
   * @since 26.9
   */
  output_format?: string;

  /**
   * Sets the page number for paginated results. Equivalent to `offset = limit * (page - 1)`. Can only be specified when `limit` is set and `offset` is not. Pages are 1-based. Inherits the same negative/fractional support as `limit` and `offset`. This is a query-construction setting applied by the engine on the parsed query (wrapping it as a derived table), so it composes with the existing query and works on every protocol: it can be supplied via the HTTP URL parameter, an in-query `SETTINGS` clause, or a user profile. It shapes result-producing `SELECT` / `UNION` queries. For a write query (`INSERT … SELECT`, `CREATE … AS SELECT`) it takes effect only when the source `SELECT` carries it in its own `SETTINGS` clause; a value inherited from a profile or session, or set on the `INSERT` / `CREATE` statement itself, does not propagate into the source `SELECT` — the same non-propagation rule that applies to any other setting.
   * @since 26.9
   */
  page?: number;

  /**
   * Size of file chunks to store in the userspace page cache, in bytes. All reads that go through the cache will be rounded up to a multiple of this size. This setting can be adjusted on a per-query level basis, but cache entries with different block sizes cannot be reused. Changing this setting effectively invalidates existing entries in the cache. A higher value, like 1 MiB is good for high-throughput queries, and a lower value, like 64 KiB is good for low-latency point queries.
   * @since 25.6
   */
  page_cache_block_size?: bigint;

  /**
   * Userspace page cache will sometimes invalidate some pages at random. Intended for testing.
   */
  page_cache_inject_eviction?: boolean;

  /**
   * On userspace page cache miss, read up to this many consecutive blocks at once from the underlying storage, if they're also not in the cache. Each block is page_cache_block_size bytes. A higher value is good for high-throughput queries, while low-latency point queries will work better without readahead.
   * @since 25.6
   */
  page_cache_lookahead_blocks?: bigint;

  /**
   * When `readBigAt` populates the userspace page cache, consecutive cache misses are coalesced into a single read from the underlying storage. This setting bounds the size of one coalesced read in bytes; longer miss runs are split into multiple reads. It limits transient memory usage of the temporary buffer under parallel cold reads. A higher value reduces the number of HTTP requests for cold scans on object storage; a lower value reduces peak transient memory.
   * @since 26.6
   */
  page_cache_max_coalesced_bytes?: bigint;

  /**
   * Query-level targeted snapshot read for Paimon incremental mode. When >0, the reader will only fetch the delta for the specified snapshot_id without advancing the committed watermark. Default: -1 (disabled)
   * @since 26.6
   */
  paimon_target_snapshot_id?: bigint;

  /**
   * Enables parallel distributed `INSERT ... SELECT` query. If we execute `INSERT INTO distributed_table_a SELECT ... FROM distributed_table_b` queries and both tables use the same cluster, and both tables are either [replicated](/reference/engines/table-engines/mergetree-family/replication) or non-replicated, then this query is processed locally on every shard. Possible values: - `0` — Disabled. - `1` — `SELECT` will be executed on each shard from the underlying table of the distributed engine. - `2` — `SELECT` and `INSERT` will be executed on each shard from/to the underlying table of the distributed engine. Since v25.4, `INSERT ... SELECT` from a `ReplicatedMergeTree` or `SharedMergeTree` source can also be parallelized across replicas. To enable it: - `parallel_distributed_insert_select = 2` - `enable_parallel_replicas = 1`
   */
  parallel_distributed_insert_select?: bigint;

  /**
   * When hash-based join algorithm is applied, this threshold helps to decide between using `hash` and `parallel_hash` (only if estimation of the right table size is available). The former is used when we know that the right table size is below the threshold.
   * @since 25.6
   */
  parallel_hash_join_threshold?: bigint;

  /**
   * Allow multiple threads to process non-joined rows from the right table in parallel during RIGHT and FULL JOINs. This can speed up the non-joined phase when using the `parallel_hash` join algorithm with large tables. When disabled, non-joined rows are processed by a single thread.
   * @since 26.3
   */
  parallel_non_joined_rows_processing?: boolean;

  /**
   * This is internal setting that should not be used directly and represents an implementation detail of the 'parallel replicas' mode. This setting will be automatically set up by the initiator server for distributed queries to the index of the replica participating in query processing among parallel replicas.
   */
  parallel_replica_offset?: bigint;

  /**
   * If true, subquery for IN will be executed on every follower replica.
   */
  parallel_replicas_allow_in_with_subquery?: boolean;

  /**
   * Allow usage of materialized views with parallel replicas
   * @since 26.1
   */
  parallel_replicas_allow_materialized_views?: boolean;

  /**
   * Allow reading from a `Merge` table with parallel replicas. Effective only together with [parallel_replicas_plan_based](#parallel_replicas_plan_based): the read from the `Merge` table is expanded into a union of the reads from the underlying `MergeTree` tables, which is then distributed like any other union. A `Merge` table is left to a single replica when any of its underlying tables cannot be read that way (a non-`MergeTree` table, a `FINAL` read). Set it to `false` to read every `Merge` table on a single replica, as before the support was added. Experimental.
   * @since 26.10
   */
  parallel_replicas_allow_merge_tables?: boolean;

  /**
   * Allow parallel replicas to execute the outer query of a simple view over `MergeTree` tables (instead of the view's inner query), improving parallelization across nodes. Also applies to `UNION ALL` views whose branches all read from different `MergeTree` tables.
   * @since 26.5
   */
  parallel_replicas_allow_view_over_mergetree?: boolean;

  /**
   * The timeout in milliseconds for connecting to a remote replica during query execution with parallel replicas. If the timeout is expired, the corresponding replicas is not used for query execution
   * @since 25.7
   */
  parallel_replicas_connect_timeout_ms?: number;

  /**
   * This is internal setting that should not be used directly and represents an implementation detail of the 'parallel replicas' mode. This setting will be automatically set up by the initiator server for distributed queries to the number of parallel replicas participating in query processing.
   */
  parallel_replicas_count?: bigint;

  /**
   * An arbitrary integer expression that can be used to split work between replicas for a specific table. The value can be any integer expression. Simple expressions using primary keys are preferred. If the setting is used on a cluster that consists of a single shard with multiple replicas, those replicas will be converted into virtual shards. Otherwise, it will behave same as for `SAMPLE` key, it will use multiple replicas of each shard. The expression is checked against the column-level `SELECT` grants of the user. For a view with `SQL SECURITY DEFINER` or `NONE` it is applied to the columns of the view; the body of the view is read without it.
   */
  parallel_replicas_custom_key?: string;

  /**
   * Allows the filter type `range` to split the work evenly between replicas based on the custom range `[parallel_replicas_custom_key_range_lower, INT_MAX]`. When used in conjunction with [parallel_replicas_custom_key_range_upper](#parallel_replicas_custom_key_range_upper), it lets the filter evenly split the work over replicas for the range `[parallel_replicas_custom_key_range_lower, parallel_replicas_custom_key_range_upper]`. Note: This setting will not cause any additional data to be filtered during query processing, rather it changes the points at which the range filter breaks up the range `[0, INT_MAX]` for parallel processing.
   */
  parallel_replicas_custom_key_range_lower?: bigint;

  /**
   * Allows the filter type `range` to split the work evenly between replicas based on the custom range `[0, parallel_replicas_custom_key_range_upper]`. A value of 0 disables the upper bound, setting it the max value of the custom key expression. When used in conjunction with [parallel_replicas_custom_key_range_lower](#parallel_replicas_custom_key_range_lower), it lets the filter evenly split the work over replicas for the range `[parallel_replicas_custom_key_range_lower, parallel_replicas_custom_key_range_upper]`. Note: This setting will not cause any additional data to be filtered during query processing, rather it changes the points at which the range filter breaks up the range `[0, INT_MAX]` for parallel processing
   */
  parallel_replicas_custom_key_range_upper?: bigint;

  /**
   * Push a condition standing above the part of the query parallel replicas execute into that part, and into the query the replicas are sent, so that they filter by it as well. Turn it off to keep the condition above the read on the initiator, as versions before 26.10 did. It is the way out if the push-down misbehaves: the answer does not change either way, only how much work the replicas do and how early they do it.
   * @since 26.3
   */
  parallel_replicas_filter_pushdown?: boolean;

  /**
   * Replace table function engines with their -Cluster alternatives
   * @since 25.4
   */
  parallel_replicas_for_cluster_engines?: boolean;

  /**
   * If true, ClickHouse will use parallel replicas algorithm also for non-replicated MergeTree tables
   */
  parallel_replicas_for_non_replicated_merge_tree?: boolean;

  /**
   * If enabled, parallel replicas can be used for queries joining multiple tables (queries with `JOIN`). If disabled, parallel replicas are not used for such queries, and they are executed without parallel replicas. The setting affects only queries with `JOIN`, where the non-leftmost side is read in full on every replica. A `UNION` query without a `JOIN` is not affected: each `UNION` branch is an independent single-table read, so parallel replicas remain applicable to it. A `UNION` used as a table expression of a `JOIN` is a part of a query joining multiple tables and is affected. `ARRAY JOIN` does not count as a join between tables.
   * @since 26.11
   */
  parallel_replicas_for_queries_with_multiple_tables?: boolean;

  /**
   * Index analysis done only on replica-coordinator and skipped on other replicas. Effective only with enabled parallel_replicas_local_plan This concerns the index analysis that selects the mark ranges a read announces, which is what the coordinator assigns from. It does not cover pruning that happens while the data is read, such as the granule pruning of `enable_join_runtime_filters_index_analysis`: a JOIN runtime filter only exists once the build side has been read, so every replica evaluates its own and prunes its own share, and no coordinator could do it for them.
   * @since 25.1
   */
  parallel_replicas_index_analysis_only_on_coordinator?: boolean;

  /**
   * Build local plan for local replica
   */
  parallel_replicas_local_plan?: boolean;

  /**
   * Parts virtually divided into segments to be distributed between replicas for parallel reading. This setting controls the size of these segments. Not recommended to change until you're absolutely sure in what you're doing. Value should be in range [128; 16384]
   */
  parallel_replicas_mark_segment_size?: bigint;

  /**
   * Limit the number of replicas used in a query to (estimated rows to read / min_number_of_rows_per_replica). The max is still limited by 'max_parallel_replicas'
   */
  parallel_replicas_min_number_of_rows_per_replica?: bigint;

  /**
   * Type of filter to use with custom key for parallel replicas. default - use modulo operation on the custom key, range - use range filter on custom key using all possible values for the value type of custom key.
   */
  parallel_replicas_mode?:
    | "auto"
    | "read_tasks"
    | "custom_key_sampling"
    | "custom_key_range"
    | "sampling_key";

  /**
   * Decide whether and where to use parallel replicas by analyzing the query plan, as opposed to the query-tree-based analysis. As a result, a plan fragment is sent to the remote replicas instead of a SQL query. Experimental. Has no effect on a distributed `INSERT SELECT` ([parallel_distributed_insert_select](#parallel_distributed_insert_select) = 2), which ships the whole `INSERT` as a query to every replica: a replica executing that query reads with the query-tree-based implementation, so the initiator, taking part as one more replica, uses it too.
   * @since 26.8
   */
  parallel_replicas_plan_based?: boolean;

  /**
   * If true, and `JOIN` can be executed with parallel replicas algorithm, and every storage of the `JOIN` part that would otherwise be materialized into a temporary table can be read by each replica on its own, local `JOIN` will be used instead of `GLOBAL JOIN`. That part is the right one, except for a `RIGHT JOIN`, where it is the left one and where every storage has to be eligible for parallel replicas rather than merely `*MergeTree`. A storage under the materialized side of a nested `GLOBAL JOIN`, or under a `GLOBAL IN`, does not count, because the initiator materializes those itself.
   */
  parallel_replicas_prefer_local_join?: boolean;

  /**
   * When enabled (default), the local replica is always included in the set of replicas used for parallel reading. When disabled, the local replica is not given any preference and replicas are selected purely by the load balancing algorithm. This allows queries with `max_parallel_replicas = 1` to be directed to another host, which can improve cache locality when many short queries are distributed across a cluster.
   * @since 26.6
   */
  parallel_replicas_prefer_local_replica?: boolean;

  /**
   * Optimization of projections can be applied in parallel replicas. Effective only with enabled parallel_replicas_local_plan.
   * @since 25.9
   */
  parallel_replicas_support_projection?: boolean;

  /**
   * Enables pushing to attached views concurrently instead of sequentially.
   */
  parallel_view_processing?: boolean;

  /**
   * Parallelize output for reading step from storage. It allows parallelization of query processing right after reading from storage if possible
   */
  parallelize_output_from_storages?: boolean;

  /**
   * Formatter '%e' in function 'parseDateTime' expects that single-digit days are space-padded, e.g., ' 2' is accepted but '2' raises an error.
   * @since 25.6
   */
  parsedatetime_e_requires_space_padding?: boolean;

  /**
   * Formatters '%c', '%l' and '%k' in function 'parseDateTime' parse months and hours without leading zeros.
   */
  parsedatetime_parse_without_leading_zeros?: boolean;

  /**
   * If not 0 group left table blocks in bigger ones for left-side table in partial merge join. It uses up to 2x of specified memory per joining thread.
   */
  partial_merge_join_left_table_buffer_bytes?: bigint;

  /**
   * Limits sizes of right-hand join data blocks in partial merge join algorithm for [JOIN](/reference/statements/select/join) queries. ClickHouse server: 1. Splits right-hand join data into blocks with up to the specified number of rows. 2. Indexes each block with its minimum and maximum values. 3. Unloads prepared blocks to disk if it is possible. Possible values: - Any positive integer. Recommended range of values: [1000, 100000].
   */
  partial_merge_join_rows_in_right_blocks?: bigint;

  /**
   * Allows query to return a partial result after cancel.
   */
  partial_result_on_first_cancel?: boolean;

  /**
   * If the destination table contains at least that many active parts in a single partition, artificially slow down insert into table.
   */
  parts_to_delay_insert?: bigint;

  /**
   * If more than this number active parts in a single partition of the destination table, throw 'Too many parts ...' exception.
   */
  parts_to_throw_insert?: bigint;

  /**
   * Logs index statistics per part
   * @since 25.9
   */
  per_part_index_stats?: boolean;

  /**
   * Block at the query wait loop on the server for the specified number of seconds.
   */
  poll_interval?: bigint;

  /**
   * Source SQL dialect for the polyglot transpiler (e.g. 'sqlite', 'mysql', 'postgresql', 'snowflake', 'duckdb').
   * @since 26.4
   */
  polyglot_dialect?: string;

  /**
   * Connection timeout in seconds of a single attempt to connect PostgreSQL end-point. The value is passed as a `connect_timeout` parameter of the connection URL.
   */
  postgresql_connection_attempt_timeout?: bigint;

  /**
   * Close connection before returning connection to the pool.
   */
  postgresql_connection_pool_auto_close_connection?: boolean;

  /**
   * Connection pool push/pop retries number for PostgreSQL table engine and database engine.
   */
  postgresql_connection_pool_retries?: bigint;

  /**
   * Connection pool size for PostgreSQL table engine and database engine.
   */
  postgresql_connection_pool_size?: bigint;

  /**
   * Connection pool push/pop timeout on empty pool for PostgreSQL table engine and database engine. By default it will block on empty pool.
   */
  postgresql_connection_pool_wait_timeout?: bigint;

  /**
   * Approximate probability of failing internal (for replication) PostgreSQL queries. Valid value is in interval [0.0f, 1.0f]
   * @since 25.3
   */
  postgresql_fault_injection_probability?: number;

  /**
   * Collect predicate selectivity statistics into `system.predicate_statistics_log`. When set to N > 0, approximately 1/N of queries are sampled (by the query ID). 0 means disabled.
   * @since 26.6
   */
  predicate_statistics_sample_rate?: bigint;

  /**
   * Enables or disables using the original column names instead of aliases in query expressions and clauses. It especially matters when alias is the same as the column name, see [Expression Aliases](/reference/syntax#notes-on-usage). Enable this setting to make aliases syntax rules in ClickHouse more compatible with most other database engines. Possible values: - 0 — The column name is substituted with the alias. - 1 — The column name is not substituted with the alias. If the column name is ambiguous between joined tables and an alias with the same name exists, the alias is used: ```sql SET prefer_column_name_to_alias = 1; SELECT t1.id + 10 AS id, id AS x FROM (SELECT 1 AS id) AS t1, (SELECT 1 AS k) AS t2, (SELECT 2 AS id) AS t3; ``` ```text ┌─id─┬──x─┐ │ 11 │ 11 │ └────┴────┘ ``` Here `id` in `id AS x` is a column of both `t1` and `t3`, so it resolves to the alias `t1.id + 10`. **Example** The difference between enabled and disabled: Query: ```sql SET prefer_column_name_to_alias = 0; SELECT avg(number) AS number, max(number) FROM numbers(10); ``` Result: ```text Received exception from server (version 21.5.1): Code: 184. DB::Exception: Received from localhost:9000. DB::Exception: Aggregate function avg(number) is found inside another aggregate function in query: While processing avg(number) AS number. ``` Query: ```sql SET prefer_column_name_to_alias = 1; SELECT avg(number) AS number, max(number) FROM numbers(10); ``` Result: ```text ┌─number─┬─max(number)─┐ │ 4.5 │ 9 │ └────────┴─────────────┘ ```
   */
  prefer_column_name_to_alias?: boolean;

  /**
   * Preferred block size in bytes for spill files used by external `ORDER BY` and `DISTINCT`. Smaller blocks reduce memory usage when merging spill files. The block size is estimated from average row size, so blocks with unusually large rows can exceed this target. Set to `0` to size blocks by the row limit only.
   */
  prefer_external_sort_block_bytes?: bigint;

  /**
   * Enables the replacement of `IN`/`JOIN` operators with `GLOBAL IN`/`GLOBAL JOIN`. Possible values: - 0 — Disabled. `IN`/`JOIN` operators are not replaced with `GLOBAL IN`/`GLOBAL JOIN`. - 1 — Enabled. `IN`/`JOIN` operators are replaced with `GLOBAL IN`/`GLOBAL JOIN`. **Usage** Although `SET distributed_product_mode=global` can change the queries behavior for the distributed tables, it's not suitable for local tables or tables from external resources. Here is when the `prefer_global_in_and_join` setting comes into play. For example, we have query serving nodes that contain local tables, which are not suitable for distribution. We need to scatter their data on the fly during distributed processing with the `GLOBAL` keyword — `GLOBAL IN`/`GLOBAL JOIN`. Another use case of `prefer_global_in_and_join` is accessing tables created by external engines. This setting helps to reduce the number of calls to external sources while joining such tables: only one call per query. **See also:** - [Distributed subqueries](/reference/statements/in#distributed-subqueries) for more information on how to use `GLOBAL IN`/`GLOBAL JOIN`
   */
  prefer_global_in_and_join?: boolean;

  /**
   * Enables/disables preferable using the localhost replica when processing distributed queries. Possible values: - 1 — ClickHouse always sends a query to the localhost replica if it exists. - 0 — ClickHouse uses the balancing strategy specified by the [load_balancing](#load_balancing) setting. <Note> Disable this setting if you use [max_parallel_replicas](#max_parallel_replicas) without [parallel_replicas_custom_key](#parallel_replicas_custom_key). If [parallel_replicas_custom_key](#parallel_replicas_custom_key) is set, disable this setting only if it's used on a cluster with multiple shards containing multiple replicas. If it's used on a cluster with a single shard and multiple replicas, disabling this setting will have negative effects. </Note>
   */
  prefer_localhost_replica?: boolean;

  /**
   * Makes the projection optimization prefer [projections](/reference/engines/table-engines/mergetree-family/mergetree#projections) over the table in `SELECT` queries, when projection optimization is enabled (see [optimize_use_projections](#optimize_use_projections) setting). When enabled, a projection that can serve the query is used even if it requires reading more marks than the table itself, the same as with [force_optimize_projection](#force_optimize_projection), but the query does not fail when no projection can be used. Possible values: - 0 — Projections are chosen by their estimated cost. - 1 — A usable projection is chosen regardless of its estimated cost.
   * @since 26.11
   */
  prefer_optimize_projection?: boolean;

  /**
   * Only has an effect in ClickHouse Cloud. If a merged part is less than this many seconds old and is not pre-warmed (see [cache_populated_by_fetch](/reference/settings/merge-tree-settings/cache-populated-by-fetch#cache_populated_by_fetch)), but all its source parts are available and pre-warmed, SELECT queries will read from those parts instead. Only for Replicated-/SharedMergeTree. Note that this only checks whether CacheWarmer processed the part; if the part was fetched into cache by something else, it'll still be considered cold until CacheWarmer gets to it; if it was warmed, then evicted from cache, it'll still be considered warm.
   */
  prefer_warmed_unmerged_parts_seconds?: bigint;

  /**
   * This setting adjusts the data block size for query processing and represents additional fine-tuning to the more rough 'max_block_size' setting. If the columns are large and with 'max_block_size' rows the block size is likely to be larger than the specified amount of bytes, its size will be lowered for better CPU cache locality.
   */
  preferred_block_size_bytes?: bigint;

  /**
   * Limit on max column size in block while reading. Helps to decrease cache misses count. Should be close to L2 cache size.
   */
  preferred_max_column_in_block_size_bytes?: bigint;

  /**
   * If it is set to a non-empty string, ClickHouse will try to apply specified projection in query. Possible values: - string: name of preferred projection
   */
  preferred_optimize_projection_name?: string;

  /**
   * The maximum size of the prefetch buffer to read from the filesystem. Values above 256 MiB are clamped to 256 MiB, as a read buffer never needs to be larger.
   */
  prefetch_buffer_size?: bigint;

  /**
   * Allows to print deep-nested type names in a pretty way with indents in `DESCRIBE` query and in `toTypeName()` function. Example: ```sql CREATE TABLE test (a Tuple(b String, c Tuple(d Nullable(UInt64), e Array(UInt32), f Array(Tuple(g String, h Map(String, Array(Tuple(i String, j UInt64))))), k Date), l Nullable(String))) ENGINE=Memory; DESCRIBE TABLE test FORMAT TSVRaw SETTINGS print_pretty_type_names=1; ``` ``` a Tuple( b String, c Tuple( d Nullable(UInt64), e Array(UInt32), f Array(Tuple( g String, h Map( String, Array(Tuple( i String, j UInt64 )) ) )), k Date ), l Nullable(String) ) ```
   */
  print_pretty_type_names?: boolean;

  /**
   * Priority of the query. 1 - the highest, higher value - lower priority; 0 - do not use priorities.
   */
  priority?: bigint;

  /**
   * Specifies the database name used by the 'promql' dialect. Empty string means the current database.
   * @since 25.9
   */
  promql_database?: string;

  /**
   * Sets the evaluation time to be used with promql dialect, as a Unix timestamp in seconds with an optional fraction. 'auto' means the current time.
   * @since 25.10
   */
  promql_evaluation_time?: string;

  /**
   * Copies the label matchers of one side of a PromQL binary operator to the selectors of the other side for the labels the operator matches series by, so `b / on(job) a{job="x"}` reads only the series of `b` with `job="x"`. A matcher is not copied where the series it filters out could make Prometheus report duplicate series: into the "one" side of the operator unless it is an aggregation by the matched labels, into an operator between two vectors other than `and` and `unless`, and through a function over a range or an operator with a scalar unless its input is one metric selected by name. A comparison without `bool` keeps the metric name, so matchers always go through it. Other functions and the unary minus stop the matchers. A copied matcher turns a selector of a whole metric into a filtered one, which can be slower on a [TimeSeries](/reference/engines/table-engines/integrations/time-series) table with an `id` clustered by metric (the default) if the matcher keeps most series of the metric. Disable the setting for such queries.
   * @since 26.11
   */
  promql_push_down_label_matchers?: boolean;

  /**
   * Specifies the name of a TimeSeries table used by the 'promql' dialect.
   * @since 25.9
   */
  promql_table?: string;

  /**
   * Enable pushing user roles from originator to other nodes while performing a query.
   * @since 24.12
   */
  push_external_roles_in_interserver_queries?: boolean;

  /**
   * When a `QBit` distance function (`L2DistanceTransposed`, `cosineDistanceTransposed`, `dotProductTransposed` and their `...Quantized` variants) is called with precision 1, also reduce the reference vector to the signs of its elements and derive the result from the Hamming distance between the two sign vectors, computed with XOR and popcount. By default the reference vector keeps its full precision at precision 1 and only the stored vector is reduced to signs (an asymmetric distance). The symmetric distance is several times faster, but it ignores the magnitudes of the reference elements: a dimension where the reference is large counts as much as one where it is close to zero.
   * @since 26.11
   */
  qbit_one_bit_symmetric_distance?: boolean;

  /**
   * Compress entries in the [query cache](/concepts/features/performance/caches/query-cache). Lessens the memory consumption of the query cache at the cost of slower inserts into / reads from it. Possible values: - 0 - Disabled - 1 - Enabled
   */
  query_cache_compress_entries?: boolean;

  /**
   * If turned on, subquery results may be written to and read from the [query cache](/concepts/features/performance/caches/query-cache). This enables propagation of `use_query_cache` into all subqueries. Possible values: - 0 - Disabled - 1 - Enabled
   * @since 26.6
   */
  query_cache_for_subqueries?: boolean;

  /**
   * The maximum number of query results the current user may store in the in-memory [query cache](/concepts/features/performance/caches/query-cache). 0 means unlimited. This limit does not apply to the query cache on disk (setting `query_cache_on_disk_cache_name`), whose entries are bounded by the size of the underlying filesystem cache instead. Possible values: - Positive integer >= 0.
   */
  query_cache_max_entries?: bigint;

  /**
   * The maximum amount of memory (in bytes) the current user may allocate in the in-memory [query cache](/concepts/features/performance/caches/query-cache). 0 means unlimited. This limit does not apply to the query cache on disk (setting `query_cache_on_disk_cache_name`), whose entries are bounded by the size of the underlying filesystem cache instead. Possible values: - Positive integer >= 0.
   */
  query_cache_max_size_in_bytes?: bigint;

  /**
   * Minimum duration in milliseconds a query needs to run for its result to be stored in the [query cache](/concepts/features/performance/caches/query-cache). Possible values: - Positive integer >= 0.
   */
  query_cache_min_query_duration?: number;

  /**
   * Minimum number of times a `SELECT` query must run before its result is stored in the [query cache](/concepts/features/performance/caches/query-cache). Possible values: - Positive integer >= 0.
   */
  query_cache_min_query_runs?: bigint;

  /**
   * Controls how the [query cache](/concepts/features/performance/caches/query-cache) handles `SELECT` queries with non-deterministic functions like `rand()` or `now()`. Possible values: - `'throw'` - Throw an exception and don't cache the query result. - `'save'` - Cache the query result. - `'ignore'` - Don't cache the query result and don't throw an exception.
   */
  query_cache_nondeterministic_function_handling?: "throw" | "save" | "ignore";

  /**
   * The name of a filesystem cache (an entry of the `filesystem_caches` section of the server configuration) which stores entries of the [query cache](/concepts/features/performance/caches/query-cache) on disk. If a name is given (and [use_query_cache](#use_query_cache) is enabled), query results are additionally cached in (and served from) the specified filesystem cache. The on-disk query cache provides more space than the in-memory query cache, survives server restarts, and works independently of the in-memory query cache: settings [enable_reads_from_query_cache_on_disk](#enable_reads_from_query_cache_on_disk) and [enable_writes_to_query_cache_on_disk](#enable_writes_to_query_cache_on_disk) control it separately from the in-memory query cache. The entries in the filesystem cache are ordinary entries of the filesystem cache: they are not held from deletion and they are evicted by the same rules as any other data in it. `SYSTEM CLEAR FILESYSTEM CACHE '<name>'` removes them together with everything else in the filesystem cache, and `SYSTEM CLEAR QUERY CACHE` removes the entries of the query cache on disk from the filesystem cache named by this setting, leaving all other data in place. A dedicated filesystem cache for query results is recommended. Possible values: - Empty string - The query cache on disk is disabled - The name of a preconfigured filesystem cache
   * @since 26.11
   */
  query_cache_on_disk_cache_name?: string;

  /**
   * The compression codec for entries of the [query cache](/concepts/features/performance/caches/query-cache) on disk (see [query_cache_on_disk_cache_name](#query_cache_on_disk_cache_name)). Only affects writing; reading is independent of this setting because the compressed data is self-describing.
   * @since 26.11
   */
  query_cache_on_disk_codec?: string;

  /**
   * If turned on, the result of `SELECT` queries cached in the [query cache](/concepts/features/performance/caches/query-cache) can be read by other users. It is not recommended to enable this setting due to security reasons. Possible values: - 0 - Disabled - 1 - Enabled
   */
  query_cache_share_between_users?: boolean;

  /**
   * Squash partial result blocks to blocks of size [max_block_size](#max_block_size). Reduces performance of inserts into the [query cache](/concepts/features/performance/caches/query-cache) but improves the compressability of cache entries (see [query_cache_compress-entries](#query_cache_compress_entries)). Possible values: - 0 - Disabled - 1 - Enabled
   */
  query_cache_squash_partial_results?: boolean;

  /**
   * Controls how the [query cache](/concepts/features/performance/caches/query-cache) handles `SELECT` queries against system tables, i.e. tables in databases `system.*` and `information_schema.*`. Possible values: - `'throw'` - Throw an exception and don't cache the query result. - `'save'` - Cache the query result. - `'ignore'` - Don't cache the query result and don't throw an exception.
   */
  query_cache_system_table_handling?: "throw" | "save" | "ignore";

  /**
   * A string which acts as a label for [query cache](/concepts/features/performance/caches/query-cache) entries. The same queries with different tags are considered different by the query cache. Possible values: - Any string
   */
  query_cache_tag?: string;

  /**
   * After this time in seconds entries in the [query cache](/concepts/features/performance/caches/query-cache) become stale. Possible values: - Positive integer >= 0.
   */
  query_cache_ttl?: number;

  /**
   * For conditions involving the current time in the [query condition cache](/concepts/features/performance/caches/query-condition-cache) of `MergeTree` tables (see [`use_query_condition_cache_for_time_conditions`](#use_query_condition_cache_for_time_conditions)): the size of the grid onto which time constants are rounded, as a fraction of the distance between the constant and the current time. For example, with the default factor 1.0, the constant in `WHERE time >= now() - INTERVAL 10 DAY` is rounded onto a one day grid (capped at one day), and the constant in `WHERE time >= now() - INTERVAL 1 HOUR` onto a one hour grid. Smaller values keep the derived condition closer to the original one (less over-reading near the boundary) at the cost of the cache key rotating more frequently. The grid step is clamped to at least one second, so a small factor makes the derived condition converge to the original one instead of disabling it. Values less than or equal to 0 disable the derivation entirely.
   * @since 26.11
   */
  query_condition_cache_time_condition_grid_factor?: number;

  /**
   * The interval in milliseconds at which the [query_metric_log](/reference/system-tables/query_metric_log) for individual queries is collected. If set to any negative value, it will take the value `collect_interval_milliseconds` from the [query_metric_log setting](/reference/settings/server-settings/settings/query#query_metric_log) or default to 1000 if not present. To disable the collection of a single query, set `query_metric_log_interval` to 0. Default value: -1
   */
  query_metric_log_interval?: bigint;

  /**
   * Toggles a query-plan-level optimization which, when a final aggregation feeds `ORDER BY` over the aggregation's outputs with `LIMIT n` and the plan proves the per-bucket selection exact, materializes only each two-level bucket's best n groups in that order during the aggregation's final conversion. The result is exact: a group outside its own bucket's best n has at least n groups ahead of it globally, so it cannot be in the global top n. Only takes effect if setting [query_plan_enable_optimizations](#query_plan_enable_optimizations) is 1. Possible values: - 0 - Disable - 1 - Enable
   * @since 26.10
   */
  query_plan_aggregation_bucket_top_k?: boolean;

  /**
   * Toggles a query-plan-level optimization for `HAVING count() <comparison> <constant>` over a `GROUP BY`. While a two-level bucket of the aggregation result is converted to chunks, a group whose count cannot satisfy the bound is skipped before its key columns are materialized, instead of being materialized and then discarded by the filter above. Speeds up "groups above a threshold" queries over a high-cardinality `GROUP BY`, where most groups are discarded and the discarded keys are most of the conversion. A skipped group is neither filtered nor finalized, so this is not only a performance toggle: a `HAVING` conjunct written before the bound, and a sibling aggregate's finalization, stop being evaluated on the groups the bound rejects. A query that raised an exception from one of those can return rows instead, for example `HAVING throwIf(cnt = 3) = 0 AND count() > 3` over a `count() AS cnt`. Setting this to 0, or `compatibility` to a version below `26.10`, keeps the previous behavior. Only takes effect if setting [query_plan_enable_optimizations](#query_plan_enable_optimizations) is 1. Possible values: - 0 - Disable - 1 - Enable
   * @since 26.11
   */
  query_plan_aggregation_having_prefilter?: boolean;

  /**
   * Allow to convert ANY JOIN to SEMI or ANTI JOIN if filter after JOIN always evaluates to false for not-matched or matched rows
   * @since 25.10
   */
  query_plan_convert_any_join_to_semi_or_anti_join?: boolean;

  /**
   * Allow to convert `JOIN` to subquery with `IN` if output columns tied to only left table. May cause wrong results with non-ANY JOINs (e.g. ALL JOINs which is the default).
   * @since 25.5
   */
  query_plan_convert_join_to_in?: boolean;

  /**
   * Allow to convert `OUTER JOIN` to `INNER JOIN` if filter after `JOIN` always filters default values
   */
  query_plan_convert_outer_join_to_inner_join?: boolean;

  /**
   * Extend `query_plan_convert_outer_join_to_inner_join` to consider a filter further up the plan and conditions of an enclosing `JOIN`. Only has an effect when `query_plan_convert_outer_join_to_inner_join` is enabled.
   * @since 26.11
   */
  query_plan_convert_outer_join_to_inner_join_transitively?: boolean;

  /**
   * Allow to perform full text search filtering using only the inverted text index in query plan.
   * @since 25.10
   */
  query_plan_direct_read_from_text_index?: boolean;

  /**
   * Show internal aliases (such as __table1) in EXPLAIN PLAN instead of those specified in the original query.
   * @since 25.10
   */
  query_plan_display_internal_aliases?: boolean;

  /**
   * Enable multithreading after evaluating window functions to allow parallel stream processing
   */
  query_plan_enable_multithreading_after_window_functions?: boolean;

  /**
   * Toggles query optimization at the query plan level. <Note> This is an expert-level setting which should only be used for debugging by developers. The setting may change in future in backward-incompatible ways or be removed. </Note> Possible values: - 0 - Disable all optimizations at the query plan level - 1 - Enable optimizations at the query plan level (but individual optimizations may still be disabled via their individual settings)
   */
  query_plan_enable_optimizations?: boolean;

  /**
   * Toggles a query-plan-level optimization which moves expressions after sorting steps. Only takes effect if setting [`query_plan_enable_optimizations`](#query_plan_enable_optimizations) is 1. <Note> This is an expert-level setting which should only be used for debugging by developers. The setting may change in future in backward-incompatible ways or be removed. </Note> Possible values: - 0 - Disable - 1 - Enable
   */
  query_plan_execute_functions_after_sorting?: boolean;

  /**
   * Toggles a query-plan-level optimization which moves filters down in the execution plan. Only takes effect if setting [query_plan_enable_optimizations](#query_plan_enable_optimizations) is 1. <Note> This is an expert-level setting which should only be used for debugging by developers. The setting may change in future in backward-incompatible ways or be removed. </Note> Possible values: - 0 - Disable - 1 - Enable
   */
  query_plan_filter_push_down?: boolean;

  /**
   * Toggles pushing filters on `LIMIT BY` key columns below the `LIMIT BY` step. Only takes effect if setting [query_plan_enable_optimizations](#query_plan_enable_optimizations) is 1. It is read independently of [query_plan_filter_push_down](#query_plan_filter_push_down): the push-down pass also runs, with that setting off, once a `JOIN` runtime filter has been added. <Note> This is an expert-level setting which should only be used for debugging by developers. The setting may change in future in backward-incompatible ways or be removed. </Note> Possible values: - 0 - Disable - 1 - Enable
   * @since 26.11
   */
  query_plan_filter_push_down_below_limit_by?: boolean;

  /**
   * Toggles a query-plan-level optimization which fuses a filter on `ARRAY JOIN`ed element columns into the `ARRAY JOIN` step, filtering the arrays in element space before expansion so that filtered-out elements are never expanded or replicated. Only takes effect if setting [query_plan_enable_optimizations](#query_plan_enable_optimizations) is 1. <Note> This is an expert-level setting which should only be used for debugging by developers. The setting may change in future in backward-incompatible ways or be removed. </Note>
   * @since 26.10
   */
  query_plan_fuse_filter_into_array_join?: boolean;

  /**
   * Execute a JOIN of two MergeTree tables as independent joins over primary-key ranges when the join keys contain a prefix of the primary key of both tables. Both tables are split into the same ranges by the values of that prefix (the same way `FINAL` splits parts into non-intersecting layers), so equal keys land in the same range, and each range is joined on its own thread. For `full_sorting_merge` and `parallel_full_sorting_merge`, this replaces a single-threaded merge join over both tables with one streaming merge join per range, running in parallel, which is typically several times faster and uses several times less memory. For `hash` and `parallel_hash`, each range gets its own hash table. It applies only when neither join runtime filters (`enable_join_runtime_filters`) nor spilling to disk (`max_bytes_ratio_before_external_join`, `max_bytes_before_external_join`) are in effect, since both make the join opaque to this optimization; then it usually does not speed up queries but may lower memory consumption. Ranges are assigned to threads statically, so a filter that is selective only in some part of the primary key range leaves some threads idle. Not applied to `FINAL`, `ASOF`, joins with several disjuncts in `ON`, or when reading with parallel replicas.
   * @since 25.5
   */
  query_plan_join_shard_by_pk_ranges?: boolean;

  /**
   * Determine which side of the join should be the build table (also called inner, the one inserted into the hash table for a hash join) in the query plan. This setting is supported only for `ALL` join strictness with the `JOIN ON` clause. Possible values are: - 'auto': Let the planner decide which table to use as the build table. - 'false': Never swap tables (the right table is the build table). - 'true': Always swap tables (the left table is the build table).
   * @since 25.1
   */
  query_plan_join_swap_table?: string;

  /**
   * Toggles a query-plan-level optimization which moves ARRAY JOINs up in the execution plan. Only takes effect if setting [query_plan_enable_optimizations](#query_plan_enable_optimizations) is 1. <Note> This is an expert-level setting which should only be used for debugging by developers. The setting may change in future in backward-incompatible ways or be removed. </Note> Possible values: - 0 - Disable - 1 - Enable
   */
  query_plan_lift_up_array_join?: boolean;

  /**
   * Toggles a query-plan-level optimization which moves larger subtrees of the query plan into union to enable further optimizations. Only takes effect if setting [`query_plan_enable_optimizations`](#query_plan_enable_optimizations) is 1. <Note> This is an expert-level setting which should only be used for debugging by developers. The setting may change in future in backward-incompatible ways or be removed. </Note> Possible values: - 0 - Disable - 1 - Enable
   */
  query_plan_lift_up_union?: boolean;

  /**
   * Toggles a query-plan-level optimization which lowers an `arrayJoin` function inside an expression into a real `ARRAY JOIN` step, so it goes through the same execution machinery as the `ARRAY JOIN` clause (lazy replication and filter fusion). Only takes effect if setting [query_plan_enable_optimizations](#query_plan_enable_optimizations) is 1. :::note This is an expert-level setting which should only be used for debugging by developers. The setting may change in future in backward-incompatible ways or be removed. :::
   * @since 26.10
   */
  query_plan_lower_array_join_function?: boolean;

  /**
   * Control maximum limit value that allows to use query plan for lazy indexing optimization in JOIN. If zero, there is no limit.
   * @since 26.7
   */
  query_plan_max_limit_for_join_lazy_indexing?: bigint;

  /**
   * Control maximum limit value that allows to use query plan for lazy materialization optimization. If zero, there is no limit.
   * @since 25.5
   */
  query_plan_max_limit_for_lazy_materialization?: bigint;

  /**
   * Control maximum limit value that allows to evaluate query plan for TopK optimization by using minmax skip index and dynamic threshold filtering. If zero, there is no limit. This setting also controls the behavior of [enable_group_by_top_k_optimization](#enable_group_by_top_k_optimization).
   * @since 26.1
   */
  query_plan_max_limit_for_top_k_optimization?: bigint;

  /**
   * Limits the total number of optimizations applied to query plan, see setting [query_plan_enable_optimizations](#query_plan_enable_optimizations). Useful to avoid long optimization times for complex queries. In the EXPLAIN PLAN query, stop applying optimizations after this limit is reached and return the plan as is. For regular query execution if the actual number of optimizations exceeds this setting, an exception is thrown. <Note> This is an expert-level setting which should only be used for debugging by developers. The setting may change in future in backward-incompatible ways or be removed. </Note>
   */
  query_plan_max_optimizations_to_apply?: bigint;

  /**
   * Maximum number of rows in an `IN`-clause set for which the projection matcher computes and compares content hashes when deciding whether two sets are equal. Sets larger than this are treated as non-matching and skip the projection. Zero disables content-hash comparison entirely: a projection match never succeeds for nodes containing `IN`-clause sets. Used by the aggregate projection matcher (and any future projection matcher that needs to compare `IN`-clause sets). Computing the content hash is `O(N log N)` in the number of set elements; this setting bounds the cost paid during planning when many `IN`-clauses appear in the query or the projection.
   * @since 26.7
   */
  query_plan_max_set_size_for_projection_match?: bigint;

  /**
   * Maximum length of step description in EXPLAIN PLAN.
   * @since 25.10
   */
  query_plan_max_step_description_length?: bigint;

  /**
   * Allow to merge expressions into JOIN step during join reordering optimization.
   * @since 26.8
   */
  query_plan_merge_expression_into_join?: boolean;

  /**
   * Toggles a query-plan-level optimization which merges consecutive filters. Only takes effect if setting [query_plan_enable_optimizations](#query_plan_enable_optimizations) is 1. <Note> This is an expert-level setting which should only be used for debugging by developers. The setting may change in future in backward-incompatible ways or be removed. </Note> Possible values: - 0 - Disable - 1 - Enable
   */
  query_plan_merge_expressions?: boolean;

  /**
   * Allow to merge filter into `JOIN` condition and convert `CROSS JOIN` to `INNER`.
   * @since 25.6
   */
  query_plan_merge_filter_into_join_condition?: boolean;

  /**
   * Allow to merge filters in the query plan.
   */
  query_plan_merge_filters?: boolean;

  /**
   * Control the minimum number of payload columns from the left side required for enabling lazy indexing optimization in JOIN. 0 means the optimization is disabled.
   * @since 26.7
   */
  query_plan_min_columns_for_join_lazy_indexing?: bigint;

  /**
   * Allow to answer `SELECT count() ... WHERE <text search predicate>` directly from the text index posting-list cardinalities, without materializing the matching rows. Only takes effect when `query_plan_direct_read_from_text_index` is enabled.
   * @since 26.9
   */
  query_plan_optimize_count_from_text_index?: boolean;

  /**
   * Specifies which JOIN order algorithms to attempt during query plan optimization. The following algorithms are available: - 'greedy' - basic greedy algorithm - works fast but might not produce the best join order - 'dpsize' - implements DPsize algorithm currently only for Inner joins - considers all possible join orders and finds the most optimal one but might be slow for queries with many tables and join predicates. - 'dpsub' - implements DPsub algorithm which supports both inner and non-inner joins - considers all possible join orders and finds the most optimal one but might be slow for queries with many tables and join predicates. - 'dphyp' - implements DPhyp (Dynamic Programming via Hypergraph Partitioning) algorithm currently only for inner joins - explores the same search space as `dpsize` but enumerates only connected subgraph pairs, which generates fewer intermediate joins on sparse join graphs, at the cost of not considering cross products Multiple algorithms can be specified as a comma-separated list, e.g. `dphyp,greedy`. They are tried in order; if an algorithm cannot handle the query (e.g. due to outer joins or disconnected components), the next one is used as a fallback.
   * @since 26.1
   */
  query_plan_optimize_join_order_algorithm?: "greedy" | "dpsize" | "dpsub" | "dphyp";

  /**
   * Only affects the `dpsub` join order algorithm. Selects the conflict detector that DPsub uses to decide which join reorderings are valid. The following values are available: - `''` (default) - no conflict detector, DPsub uses the per-relation `ON` clause restriction - `'a'` - the CD-A conflict detector, which is correct but incomplete - `'c'` - the CD-C conflict detector, which is correct and complete
   * @since 26.11
   */
  query_plan_optimize_join_order_conflict_detector?: "a" | "c";

  /**
   * Optimize the order of joins within the same subquery. Currently only supported for very limited cases. Value is the maximum number of tables to optimize.
   * @since 25.10
   */
  query_plan_optimize_join_order_limit?: bigint;

  /**
   * Maximum number of partial plans the join order optimizer may enumerate before giving up and falling back to the next algorithm in `query_plan_optimize_join_order_algorithm`. This bounds optimization time deterministically (independent of wall-clock) on dense join graphs such as cliques or stars, where the search space grows exponentially. Set to 0 to disable the limit. Has no effect on the default `query_plan_optimize_join_order_limit`, where the search always stays well below this bound.
   * @since 26.7
   */
  query_plan_optimize_join_order_max_searched_plans?: bigint;

  /**
   * When non-zero, the join order optimizer uses randomly generated cardinalities and NDVs instead of real statistics. When set to 1, a random seed is generated, when set to a value > 1, that value is used as the seed directly. This is intended for testing to find errors caused by different join orderings.
   * @since 26.5
   */
  query_plan_optimize_join_order_randomize?: bigint;

  /**
   * Optimize reading with FINAL from ReplacingMergeTree by building a set of primary keys and using it for index analysis.
   * @since 26.5
   */
  query_plan_optimize_lazy_final?: boolean;

  /**
   * Use query plan for lazy materialization optimization.
   * @since 25.5
   */
  query_plan_optimize_lazy_materialization?: boolean;

  /**
   * Use lazy materialization optimization for reading local Parquet files with the `file` table function and the `File` table engine: for `ORDER BY ... LIMIT n` queries, the columns that are not needed for sorting and filtering are read only for the `n` rows that survive the `LIMIT`. Takes effect only if `query_plan_optimize_lazy_materialization` is enabled.
   * @since 26.9
   */
  query_plan_optimize_lazy_materialization_for_file?: boolean;

  /**
   * Use lazy materialization optimization for reading Parquet files from object storage (including Iceberg tables): for `ORDER BY ... LIMIT n` queries, the columns that are not needed for sorting and filtering are read only for the `n` rows that survive the `LIMIT`. Takes effect only if `query_plan_optimize_lazy_materialization` is enabled.
   * @since 26.9
   */
  query_plan_optimize_lazy_materialization_for_object_storage?: boolean;

  /**
   * Toggles a query-plan-level optimization which copies filter conjuncts from one side of an equi-join onto the other side via equi-key substitution, so that primary-key/index pruning on the other side can use them. Applies when the filter and the `MergeTree` read are separated from the join only by expression and filter steps, and when the copied conjunct compares a primary key column with a constant (including `IN` with a constant set). A predicate below a nested join or below `DISTINCT`, or a comparison between two key columns, is left alone: it could not drive primary key pruning on the other side, so copying it would only add work. Only takes effect if `query_plan_enable_optimizations` is 1.
   * @since 26.10
   */
  query_plan_propagate_predicate_across_join?: boolean;

  /**
   * Toggles a query-plan-level optimization which moves LIMITs down in the execution plan. Only takes effect if setting [query_plan_enable_optimizations](#query_plan_enable_optimizations) is 1. <Note> This is an expert-level setting which should only be used for debugging by developers. The setting may change in future in backward-incompatible ways or be removed. </Note> Possible values: - 0 - Disable - 1 - Enable
   */
  query_plan_push_down_limit?: boolean;

  /**
   * Toggles a query-plan-level optimization which moves volume-reducing functions (`length`, `lengthUTF8`, `empty`, `notEmpty`) down in the execution plan, below `Sorting` and `Filter` steps. The fixed-size result replaces the wide `String` / `FixedString` argument, so the argument is no longer carried through those steps. The rewrite is only applied when the argument column is not needed above the step it is pushed below. Only takes effect if setting [query_plan_enable_optimizations](#query_plan_enable_optimizations) is 1. Possible values: - 0 - Disable - 1 - Enable
   * @since 26.9
   */
  query_plan_push_down_volume_reducing_functions?: boolean;

  /**
   * Toggles a query-plan-level optimization for `ORDER BY ... LIMIT BY` queries. When `LIMIT BY` columns are a prefix of the `ORDER BY` clause, each parallel sorted stream applies `LIMIT BY` before the streams are merged into one, reducing rows processed by the final merge and later pipeline stages. Speeds up queries where `LIMIT BY` discards a large fraction of rows. Only takes effect if setting [query_plan_enable_optimizations](#query_plan_enable_optimizations) is 1. Possible values: - 0 - Disable - 1 - Enable
   * @since 26.7
   */
  query_plan_push_limit_by_into_sort?: boolean;

  /**
   * Toggles a query-plan-level optimization which removes redundant DISTINCT steps. Only takes effect if setting [`query_plan_enable_optimizations`](#query_plan_enable_optimizations) is 1. <Note> This is an expert-level setting which should only be used for debugging by developers. The setting may change in future in backward-incompatible ways or be removed. </Note> Possible values: - 0 - Disable - 1 - Enable
   */
  query_plan_remove_redundant_distinct?: boolean;

  /**
   * Toggles a query-plan-level optimization which removes redundant sorting steps, e.g. in subqueries. Only takes effect if setting [`query_plan_enable_optimizations`](#query_plan_enable_optimizations) is 1. <Note> This is an expert-level setting which should only be used for debugging by developers. The setting may change in future in backward-incompatible ways or be removed. </Note> Possible values: - 0 - Disable - 1 - Enable
   */
  query_plan_remove_redundant_sorting?: boolean;

  /**
   * Toggles a query-plan-level optimization which tries to remove unused columns (both input and output columns) from query plan steps. Only takes effect if setting [query_plan_enable_optimizations](#query_plan_enable_optimizations) is 1. <Note> This is an expert-level setting which should only be used for debugging by developers. The setting may change in future in backward-incompatible ways or be removed. </Note> Possible values: - 0 - Disable - 1 - Enable
   * @since 26.1
   */
  query_plan_remove_unused_columns?: boolean;

  /**
   * Replace a filter step with an expression step when the filter condition is always true and the query does not use the filter column. Such a filter step does not remove rows, but it stops join reordering.
   * @since 26.11
   */
  query_plan_replace_always_true_filter?: boolean;

  /**
   * Toggles a query-plan-level optimization which uses storage sorting when sorting for window functions. Only takes effect if setting [`query_plan_enable_optimizations`](#query_plan_enable_optimizations) is 1. <Note> This is an expert-level setting which should only be used for debugging by developers. The setting may change in future in backward-incompatible ways or be removed. </Note> Possible values: - 0 - Disable - 1 - Enable
   */
  query_plan_reuse_storage_ordering_for_window_functions?: boolean;

  /**
   * Short-circuit a `JOIN` whose `ON` condition folds to a constant false by replacing each input side that cannot contribute a row (both sides for `INNER`/`CROSS`/`SEMI`, the non-preserved side for `LEFT`/`RIGHT`) with an empty source, so the non-contributing side is not read. Applies to non-distributed plans.
   * @since 26.9
   */
  query_plan_short_circuit_constant_false_join?: boolean;

  /**
   * <Note> This is an expert-level setting which should only be used for debugging by developers. The setting may change in future in backward-incompatible ways or be removed. </Note> Toggles a query-plan-level optimization which splits filters into expressions. Only takes effect if setting [query_plan_enable_optimizations](#query_plan_enable_optimizations) is 1. Possible values: - 0 - Disable - 1 - Enable
   */
  query_plan_split_filter?: boolean;

  /**
   * Allow to add hint (additional predicate) for filtering built from the inverted text index in query plan.
   * @since 26.1
   */
  query_plan_text_index_add_hint?: boolean;

  /**
   * Toggles a query-plan-level optimization which pushes `ORDER BY ... LIMIT n` down through a join when the sort key only references columns from the side preserved by the join (LEFT/RIGHT). Restricts how many rows the preserved-side input must produce before joining. Only takes effect if setting [query_plan_enable_optimizations](#query_plan_enable_optimizations) is 1. Possible values: - 0 - Disable - 1 - Enable
   * @since 26.6
   */
  query_plan_top_k_through_join?: boolean;

  /**
   * Toggles a query-plan-level optimization which tries to use the vector similarity index. Only takes effect if setting [`query_plan_enable_optimizations`](#query_plan_enable_optimizations) is 1. <Note> This is an expert-level setting which should only be used for debugging by developers. The setting may change in future in backward-incompatible ways or be removed. </Note> Possible values: - 0 - Disable - 1 - Enable
   * @since 25.2
   */
  query_plan_try_use_vector_search?: boolean;

  /**
   * Sets the period for a CPU clock timer of the [query profiler](/concepts/features/performance/troubleshoot/sampling-query-profiler). This timer counts only CPU time. Possible values: - A positive integer number of nanoseconds. Recommended values: - 10000000 (100 times a second) nanoseconds and more for single queries. - 1000000000 (once a second) for cluster-wide profiling. - 0 for turning off the timer. Defaults to 0 in MemorySanitizer builds, where the sampling profiler is disabled. See also: - System table [trace_log](/reference/system-tables/trace_log)
   */
  query_profiler_cpu_time_period_ns?: bigint;

  /**
   * Sets the period for a real clock timer of the [query profiler](/concepts/features/performance/troubleshoot/sampling-query-profiler). Real clock timer counts wall-clock time. Possible values: - Positive integer number, in nanoseconds. Recommended values: - 10000000 (100 times a second) nanoseconds and less for single queries. - 1000000000 (once a second) for cluster-wide profiling. - 0 for turning off the timer. Defaults to 0 in MemorySanitizer builds, where the sampling profiler is disabled. See also: - System table [trace_log](/reference/system-tables/trace_log) Cloud default value: `3000000000`.
   */
  query_profiler_real_time_period_ns?: bigint;

  /**
   * The wait time in the request queue, if the number of concurrent requests exceeds the maximum.
   */
  queue_max_wait_ms?: number;

  /**
   * The wait time for reading from RabbitMQ before retry.
   */
  rabbitmq_max_wait_ms?: number;

  /**
   * Settings to reduce the number of threads in case of slow reads. Count events when the read bandwidth is less than that many bytes per second.
   */
  read_backoff_max_throughput?: bigint;

  /**
   * Settings to try keeping the minimal number of threads in case of slow reads.
   */
  read_backoff_min_concurrency?: bigint;

  /**
   * Settings to reduce the number of threads in case of slow reads. The number of events after which the number of threads will be reduced.
   */
  read_backoff_min_events?: bigint;

  /**
   * Settings to reduce the number of threads in case of slow reads. Do not pay attention to the event, if the previous one has passed less than a certain amount of time.
   */
  read_backoff_min_interval_between_events_ms?: number;

  /**
   * Setting to reduce the number of threads in case of slow reads. Pay attention only to reads that took at least that much time.
   */
  read_backoff_min_latency_ms?: number;

  /**
   * Only has an effect in ClickHouse Cloud. Same as read_from_filesystem_cache_if_exists_otherwise_bypass_cache, but for distributed cache.
   * @since 25.11
   */
  read_from_distributed_cache_if_exists_otherwise_bypass_cache?: boolean;

  /**
   * Allow to use the filesystem cache in passive mode - benefit from the existing cache entries, but don't put more entries into the cache. If you set this setting for heavy ad-hoc queries and leave it disabled for short real-time queries, this will allows to avoid cache threshing by too heavy queries and to improve the overall system efficiency.
   */
  read_from_filesystem_cache_if_exists_otherwise_bypass_cache?: boolean;

  /**
   * Use userspace page cache in passive mode, similar to read_from_filesystem_cache_if_exists_otherwise_bypass_cache.
   */
  read_from_page_cache_if_exists_otherwise_bypass_cache?: boolean;

  /**
   * Minimal number of parts to read to run preliminary merge step during multithread reading in order of primary key.
   */
  read_in_order_two_level_merge_threshold?: bigint;

  /**
   * Use buffering before merging while reading in order of primary key. It increases the parallelism of query execution
   */
  read_in_order_use_buffering?: boolean;

  /**
   * Use virtual row while reading in order of primary key or its monotonic function fashion. It is useful when searching over multiple parts as only the parts that can actually contribute to the result are read, plus a bounded read-ahead window of at most `max_threads` parts that keeps reads parallel.
   * @since 24.12
   */
  read_in_order_use_virtual_row?: boolean;

  /**
   * When enabled together with `read_in_order_use_virtual_row`, emit a virtual row after each block read (not only at the beginning of each part). This allows `MergingSortedTransform` to reprioritize sources more frequently, which is useful when downstream filters discard many rows and data is distributed unevenly across parts. Note that it disables `read_in_order_use_buffering` optimization and preliminary merge (`read_in_order_two_level_merge_threshold`) for reading.
   * @since 26.5
   */
  read_in_order_use_virtual_row_per_block?: boolean;

  /**
   * What to do when the limit is exceeded.
   */
  read_overflow_mode?: "throw" | "break";

  /**
   * Sets what happens when the volume of data read exceeds one of the leaf limits. Possible options: - `throw`: throw an exception (default). - `break`: stop executing the query and return the partial result.
   */
  read_overflow_mode_leaf?: "throw" | "break";

  /**
   * Priority to read data from local filesystem or remote filesystem. Only supported for 'pread_threadpool' method for local filesystem and for `threadpool` method for remote filesystem.
   */
  read_priority?: bigint;

  /**
   * Buffer chunk size for the experimental `ReaderExecutor`: source reads fill nodes of at most this size. Must be between 128 KiB and 40 MiB, the band shared by every `ReaderExecutor` size.
   * @since 26.9
   */
  reader_executor_block_size?: bigint;

  /**
   * Drain bound for the experimental `ReaderExecutor`: a long source connection dropped within this many bytes of its right bound is read out to the bound first, so it completes and returns to the connection pool reusable instead of counting as an incomplete connection.
   * @since 26.8
   */
  reader_executor_max_tail_for_drain?: bigint;

  /**
   * Forward-gap bound for the experimental `ReaderExecutor`: a gap up to this is skipped on the open source connection (bridged / read through) instead of issuing a separate source read or reopening. Set near the bandwidth/request cost breakeven so bridging stays cost-positive.
   * @since 26.8
   */
  reader_executor_min_bytes_for_seek?: bigint;

  /**
   * How far ahead the experimental `ReaderExecutor` resolves cache residency into its held read plan (a cheap probe, not a read), so one resolve serves many windows. The plan pins every cache cell it resolved until the cursor passes it, so this span drives how much memory and how much unevictable cache each concurrent reader holds. It is not an exact cap: a pin covers a whole cache segment or block, so a cell straddling either end of the range is held entire, adding up to one of them per cache tier at each end. Must be between 128 KiB and 40 MiB, the band shared by every `ReaderExecutor` size, and at least `reader_executor_block_size`.
   * @since 26.11
   */
  reader_executor_plan_look_ahead?: bigint;

  /**
   * Reuse a bounded long source connection across windows in the experimental `ReaderExecutor`. A long connection is one whose range exceeds the current read window; when disabled, the executor takes no connection-pool budget and every window opens a short-lived one-shot connection (the stateless path).
   * @since 26.8
   */
  reader_executor_use_long_connections?: boolean;

  /**
   * Bytes served per read window by the experimental `ReaderExecutor` (the unit a read returns). Must be between 128 KiB and 40 MiB, the band shared by every `ReaderExecutor` size.
   * @since 26.9
   */
  reader_executor_window_size?: bigint;

  /**
   * 0 - no read-only restrictions. 1 - only read requests, as well as changing explicitly allowed settings. 2 - only read requests, as well as changing settings, except for the 'readonly' setting. Do not make `readonly` itself changeable under `readonly = 1`: a session can then clear it with `SET readonly = 0`, unless the same constraint also forbids `0`. See [constraints on settings](/concepts/features/configuration/settings/constraints-on-settings#readonly-changeable-in-readonly).
   */
  readonly?: bigint;

  /**
   * Connection timeout for receiving first packet of data or packet with positive progress from replica
   */
  receive_data_timeout_ms?: number;

  /**
   * Timeout for receiving data from the network, in seconds. If no bytes were received in this interval, the exception is thrown. If you set this setting on the client, the 'send_timeout' for the socket will also be set on the corresponding connection end on the server.
   */
  receive_timeout?: number;

  /**
   * Maximum number of iterations for inferring column types in recursive CTEs. Column types are determined by iteratively applying `getLeastSupertype` across the non-recursive and recursive sides of the UNION ALL until convergence. Set to 0 to disable type widening and use the types from the non-recursive part only.
   * @since 26.6
   */
  recursive_cte_max_steps_in_type_inference?: bigint;

  /**
   * Allow regexp_tree dictionary using Hyperscan library.
   * @since 26.2
   */
  regexp_dict_allow_hyperscan?: boolean;

  /**
   * Use case-insensitive matching for a regexp_tree dictionary. Can be overridden in individual expressions with (?i) and (?-i).
   * @since 26.2
   */
  regexp_dict_flag_case_insensitive?: boolean;

  /**
   * Allow '.' to match newline characters for a regexp_tree dictionary.
   * @since 26.2
   */
  regexp_dict_flag_dotall?: boolean;

  /**
   * Sets the maximum number of matches for a single regular expression per row. Use it to protect against memory overload when using greedy regular expression in the [extractAllGroupsHorizontal](/reference/functions/regular-functions/string-search-functions#extractAllGroupsHorizontal) function. Possible values: - Positive integer.
   */
  regexp_max_matches_per_row?: bigint;

  /**
   * Reject patterns which will likely be expensive to evaluate with hyperscan (due to NFA state explosion)
   */
  reject_expensive_hyperscan_regexps?: boolean;

  /**
   * If memory usage after remerge does not reduced by this ratio, remerge will be disabled.
   */
  remerge_sort_lowered_memory_bytes_ratio?: number;

  /**
   * Method of reading data from remote filesystem, one of: read, threadpool.
   */
  remote_filesystem_read_method?: string;

  /**
   * Should use prefetching when reading data from remote filesystem.
   */
  remote_filesystem_read_prefetch?: boolean;

  /**
   * Max attempts to read with backoff
   */
  remote_fs_read_backoff_max_tries?: bigint;

  /**
   * Max wait time when trying to read data for remote disk
   */
  remote_fs_read_max_backoff_ms?: bigint;

  /**
   * Min bytes required for remote read (url, s3) to do seek, instead of read with ignore.
   */
  remote_read_min_bytes_for_seek?: bigint;

  /**
   * - **Type:** String - **Default value:** Empty string This setting allows to specify renaming pattern for files processed by `file` table function. When option is set, all files read by `file` table function will be renamed according to specified pattern with placeholders, only if files processing was successful. Renaming is a write to the source, so a query that reads the files with this option set requires the `WRITE ON FILE` grant in addition to `READ ON FILE`. `DESCRIBE` does not build the data-reading pipeline that renames, and so requires only `READ ON FILE`. ### Placeholders - `%a` — Full original filename (e.g., "sample.csv"). - `%f` — Original filename without extension (e.g., "sample"). - `%e` — Original file extension with dot (e.g., ".csv"). - `%t` — Timestamp (in microseconds). - `%%` — Percentage sign ("%"). ### Example - Option: `--rename_files_after_processing="processed_%f_%t%e"` - Query: `SELECT * FROM file('sample.csv')` If reading `sample.csv` is successful, file will be renamed to `processed_sample_1683473210851438.csv`
   */
  rename_files_after_processing?: string;

  /**
   * When using the HTTP interface, the 'query_id' parameter can be passed. This is any string that serves as the query identifier. If a query from the same user with the same 'query_id' already exists at this time, the behaviour depends on the 'replace_running_query' parameter. `0` (default) – Throw an exception (do not allow the query to run if a query with the same 'query_id' is already running). `1` – Cancel the old query and start running the new one. Set this parameter to 1 for implementing suggestions for segmentation conditions. After entering the next character, if the old query hasn't finished yet, it should be cancelled.
   */
  replace_running_query?: boolean;

  /**
   * The wait time for running the query with the same `query_id` to finish, when the [replace_running_query](#replace_running_query) setting is active. Possible values: - Positive integer. - 0 — Throwing an exception that does not allow to run a new query if the server already executes a query with the same `query_id`.
   */
  replace_running_query_max_wait_ms?: number;

  /**
   * Specifies how long (in seconds) to wait for inactive replicas to execute [`ALTER`](/reference/statements/alter/index), [`OPTIMIZE`](/reference/statements/optimize) or [`TRUNCATE`](/reference/statements/truncate) queries. Possible values: - `0` — Do not wait. - Negative integer — Wait for unlimited time. - Positive integer — The number of seconds to wait.
   */
  replication_wait_for_inactive_replica_timeout?: bigint;

  /**
   * Used in workload scheduling. The minimum amount of RAM reserved to be used for running a query on a single server. Reservation is made through the WORKLOAD hierarchy using the value of a `workload` query setting. If not enough memory is available to the workload, a query is prevented from starting and waits in pending state until the reservation can be fulfilled. A value of `0` means no reservation. This setting takes effect only if MEMORY RESERVATION resource is created.
   * @since 26.8
   */
  reserve_memory?: bigint;

  /**
   * Replace external dictionary sources to Null on restore. Useful for testing purposes
   */
  restore_replace_external_dictionary_source_to_null?: boolean;

  /**
   * For testing purposes. Replaces all external engines to Null to not initiate external connections.
   */
  restore_replace_external_engines_to_null?: boolean;

  /**
   * For testing purposes. Replaces all external table functions to Null to not initiate external connections.
   */
  restore_replace_external_table_functions_to_null?: boolean;

  /**
   * Replace table engine from Replicated*MergeTree -> Shared*MergeTree during RESTORE. Cloud default value: `1`.
   * @since 25.3
   */
  restore_replicated_merge_tree_to_shared_merge_tree?: boolean;

  /**
   * Sets what to do if the volume of the result exceeds one of the limits. Possible values: - `throw`: throw an exception (default). - `break`: stop executing the query and return the partial result, as if the source data ran out. Using 'break' is similar to using LIMIT. `Break` interrupts execution only at the block level. This means that amount of returned rows is greater than [`max_result_rows`](/reference/settings/session-settings/max-result#max_result_rows), multiple of [`max_block_size`](/reference/settings/session-settings/max#max_block_size) and depends on [`max_threads`](/reference/settings/session-settings/max-threads#max_threads). **Example** ```sql title="Query" SET max_threads = 3, max_block_size = 3333; SET max_result_rows = 3334, result_overflow_mode = 'break'; SELECT * FROM numbers_mt(100000) FORMAT Null; ``` ```text title="Result" 6666 rows in set. ... ```
   */
  result_overflow_mode?: "throw" | "break";

  /**
   * Enables resumable `BACKUP FROM SNAPSHOT`: a failed attempt can be rerun without recopying the entries of batches that already completed. Only available in ClickHouse Cloud, for directory-style `S3` and `AzureBlobStorage` destinations. Enabling it in ClickHouse open-source builds, where `BACKUP FROM SNAPSHOT` itself is unavailable, makes `BACKUP` fail with `WRONG_BACKUP_SETTINGS`.
   * @since 26.9
   */
  resumable_backup_from_snapshot?: boolean;

  /**
   * Allows you to rewrite `countDistcintIf` with [count_distinct_implementation](#count_distinct_implementation) setting. Possible values: - true — Allow. - false — Disallow.
   */
  rewrite_count_distinct_if_with_count_distinct_implementation?: boolean;

  /**
   * Rewrite expressions like 'x IN subquery' to JOIN. This might be useful for optimizing the whole query with join reordering.
   * @since 25.11
   */
  rewrite_in_to_join?: boolean;

  /**
   * When enabled, ClickHouse will provide exact value for rows_before_aggregation statistic, represents the number of rows read before aggregation
   * @since 26.2
   */
  rows_before_aggregation?: boolean;

  /**
   * If enabled, the server schedules the query in the background, immediately returns an empty successful result, and runs the query to completion regardless of what happens to the connection. A background query does not survive a server restart. On shutdown it obeys the same server settings as a foreground query: `shutdown_wait_unfinished_queries` chooses between cancelling it and waiting for it (queued entries are discarded either way, without a `system.query_log` entry), and `shutdown_wait_unfinished` limits how long the server waits. Track the query by its `query_id`: in `system.processes` while it is running and in `system.query_log` after it finishes and the query log entry is flushed. Applies to queries received over the native TCP and HTTP protocols. Over HTTP, pass the setting as a URL parameter. It cannot be changed with `SET`; enable it per query, or at the user or profile level. The main use case is a long `INSERT ... SELECT` that must not be lost when the client connection drops.
   * @since 26.9
   */
  run_query_in_background?: boolean;

  /**
   * Allow multipart copy in S3.
   * @since 25.4
   */
  s3_allow_multipart_copy?: boolean;

  /**
   * Use multiple threads for s3 multipart upload. It may lead to slightly higher memory usage
   */
  s3_allow_parallel_part_upload?: boolean;

  /**
   * Allow S3 access that originates from user SQL to use server-managed credentials. When disabled (the default), the `s3`/`s3Cluster` table functions, the `S3`/`S3Queue` engines, S3 named collections, dynamic `disk(type=s3, ...)` definitions, `BACKUP`/`RESTORE TO S3`, DataLake table-data reads, and `DataLakeCatalog` databases (Glue, BigLake) may not resolve credentials from the environment, instance metadata (IMDS), IRSA, ECS, instance profile, SSO, AWS config/credentials files, or the GCP OAuth metadata service. A request that asks for one of those server-managed sources (for example `use_environment_credentials = 1` or `http_client = gcp_oauth`) without supplying usable explicit credentials is rejected with `ACCESS_DENIED`. A request that asks for none of them is sent unsigned (anonymous), the same as if `NOSIGN` had been given. `role_arn`-based STS assume-role (`extra_credentials(role_arn = '...')`) stays allowed even when this setting is disabled: the target role must explicitly trust the identity the server runs under, and only the assumed role's credentials ever sign the query's S3 requests, so the server's own credentials are not exposed to the query. This is the documented way to grant ClickHouse Cloud access to a private bucket. The role is assumed with the query's own base keys when the query supplies a complete pair; otherwise the STS AssumeRole call is signed by the server's ambient identity. Static keys from the server `<s3>`/endpoint config or from a named collection are never used as the STS base for a query-supplied role, and a `role_arn` configured in the server `<s3>` config is not applied to user queries at all. Dynamic `disk(type=s3, role_arn=...)` definitions remain covered by the restriction. Whether a credential-less request asks for environment credentials is decided by `use_environment_credentials`. Named collections default it to `0`, so a collection that only specifies a URL reads anonymously. The `s3`/`s3Cluster` table functions and `S3`/`S3Queue` engines use the built-in default (`1`) unless the server `<s3>` config sets it otherwise; set `<s3><use_environment_credentials>0</use_environment_credentials></s3>` to make their credential-less reads anonymous by default too (otherwise such a request is refused and must use `NOSIGN`). Disks defined in the server configuration are unaffected and keep using environment credentials by default; user-created dynamic `disk(type = s3, ...)` definitions are covered by the restriction (see above) and are rejected when they rely on default/environment credentials. This prevents an authenticated user from making the server access S3 with its own (ambient) credentials. Credentials supplied explicitly are not affected: keys passed in the query, static keys in a named collection (created via SQL or defined in config), and keys in the server `<s3>` config all keep working. The recommended way to give user queries S3 access is a named collection with explicit credentials (or `NOSIGN` for public buckets): the keys stay out of the query text, and use of each collection is controlled with RBAC (`GRANT NAMED COLLECTION ON <name> TO <user>`), so you grant specific users specific buckets instead of exposing the server's own identity. Scope (out of scope on purpose): this setting blocks only the server's ambient credential sources listed above. It does not block operator-provisioned static `access_key_id`/`secret_access_key` from the server `<s3>` config or from a config-defined named collection: those are treated as explicit credentials and keep working. Note, however, that config request material such as `access_header` or server-side-encryption keys is not by itself treated as a credential here: a request that carries only such material but no explicit key pair (and the default `use_environment_credentials = 1`) is still refused, because it would otherwise fall back to the server's ambient credentials. Such an endpoint must also provide explicit keys, `NOSIGN`, `use_environment_credentials = 0`, or the escape hatch below. A trusted administrative client may need server-managed credentials for legitimate operations (for example, attaching system tables on an `s3_plain_rewritable` disk via SQL). Enable this setting in that client's session or settings profile to permit it. For `BACKUP`/`RESTORE ... ON CLUSTER` the initiator's value of this setting is propagated to the other hosts and used there as-is. Those hosts run the per-host continuation of the operation through the distributed DDL queue, by default without the initiator's user, so they would otherwise evaluate the restriction against their own default profile; the initiator's value is preserved instead, because it has already opened the same backup destination under its own, constrained, settings. A `readonly` constraint on the initiator still applies (an untrusted initiator cannot enable the setting for its own on-cluster backup), so this does not weaken the restriction. Durability for persistent `S3` and `S3Queue` tables: enabling this only per session or profile is not durable across a restart. When the server reloads such a table from its stored definition (startup or `RESTORE`) it rebuilds the S3 client and re-applies the restriction with the startup context, so a table that relied on server-managed credentials and was created only under a session/profile `s3_allow_server_credentials_in_user_queries = 1` is created successfully but becomes inaccessible after a restart (the table is left in place; queries against it fail until its credentials resolve to a permitted source again). The server itself still starts. Give such tables explicit credentials for durable access; alternatively, enabling the setting server-wide keeps them loading across restarts, at the cost of relaxing the restriction for all reloads. To keep it disabled for untrusted users, pin it in their profile by both setting the value explicitly to `0` and marking it `readonly`: ```xml <profiles> <untrusted> <!-- The explicit value is required: a `readonly` constraint alone only blocks direct changes, but `compatibility` with a version before this setting was introduced would otherwise restore the old (allowing) default. Setting the value explicitly defeats `compatibility`. --> <s3_allow_server_credentials_in_user_queries>0</s3_allow_server_credentials_in_user_queries> <constraints> <s3_allow_server_credentials_in_user_queries> <readonly/> </s3_allow_server_credentials_in_user_queries> </constraints> </untrusted> </profiles> ``` This setting has no effect in `clickhouse-local`, where the user is the operator. `DataLakeCatalog` databases (Glue, BigLake) are also covered, with one difference. A catalog object is created once and shared by every user of the database, so the value cannot be read per query; it is captured from the session that runs `CREATE DATABASE` (or a user `ATTACH DATABASE`). A database created while this setting is enabled (for example in a trusted session or profile) may use the server's ambient credentials for its catalog, and every user able to query that database then shares them; created under the default, the catalog is restricted for everyone regardless of who queries it. When the server loads an already-created database from its own metadata (startup, `RESTORE`) the restriction is re-applied with the startup context, the same as for persistent `S3`/`S3Queue` tables: a catalog that resolves server-managed credentials is left unavailable and the database becomes inaccessible after a restart (the server still starts; the database loads with an unavailable catalog per `s3_load_table_anonymously_if_credentials_restricted`, and queries report the restriction). A catalog given explicit credentials (Glue: `aws_access_key_id` and `aws_secret_access_key`; BigLake: a complete Google ADC triple) works regardless and is durable across restart.
   * @since 26.8
   */
  s3_allow_server_credentials_in_user_queries?: boolean;

  /**
   * The base URL used to resolve relative URLs in the [s3](../../sql-reference/table-functions/s3.md) table function and the [S3](../../engines/table-engines/integrations/s3.md) table engine, as well as in the table functions that share their configuration (`s3Cluster`, `gcs`, `oss`). When set, a URL without a scheme is resolved against `s3_base` per RFC 3986, using the same rules as [url_base](#url_base). URLs that already contain a scheme are used as-is. For example, if `s3_base` is `s3://clickhouse-public-datasets/`, then `s3('hits_compatible/hits.csv')` reads `s3://clickhouse-public-datasets/hits_compatible/hits.csv`. The base URL can use any form accepted by the `s3` table function, e.g. `s3://bucket/`, `https://bucket.s3.amazonaws.com/` or `https://endpoint/bucket/`. When the relative URL comes from a [named collection](/concepts/features/configuration/server-config/named-collections), resolving it counts as an override of the `url` key of the collection and requires the `SHOW NAMED COLLECTIONS SECRETS` privilege on that collection.
   * @since 26.9
   */
  s3_base?: string;

  /**
   * Check each uploaded object to s3 with head request to be sure that upload was successful
   */
  s3_check_objects_after_upload?: boolean;

  /**
   * Connection timeout for host from s3 disks.
   */
  s3_connect_timeout_ms?: bigint;

  /**
   * Enables or disables creating a new file on each insert in s3 engine tables. If enabled, on each insert a new S3 object will be created with the key, similar to this pattern: initial: `data.Parquet.gz` -> `data.1.Parquet.gz` -> `data.2.Parquet.gz`, etc. Possible values: - 0 — `INSERT` query creates a new file or fail if file exists and s3_truncate_on_insert is not set. - 1 — `INSERT` query creates a new file on each insert using suffix (from the second one) if s3_truncate_on_insert is not set. See more details [here](/integrations/connectors/data-ingestion/AWS/integrating-s3-with-clickhouse#inserting-data).
   */
  s3_create_new_file_on_insert?: boolean;

  /**
   * Ignore absence of file if it does not exist when reading certain keys. Possible values: - 1 — `SELECT` returns empty result. - 0 — `SELECT` throws an exception.
   */
  s3_ignore_file_doesnt_exist?: boolean;

  /**
   * Maximum number of files that could be returned in batch by ListObject request
   */
  s3_list_object_keys_size?: bigint;

  /**
   * Max number of requests that can be issued simultaneously before hitting request per second limit. By default (0) equals to `s3_max_get_rps`
   */
  s3_max_get_burst?: bigint;

  /**
   * Limit on S3 GET request per second rate before throttling. Zero means unlimited.
   */
  s3_max_get_rps?: bigint;

  /**
   * The maximum number of a concurrent loaded parts in multipart upload request. 0 means unlimited.
   */
  s3_max_inflight_parts_for_one_file?: bigint;

  /**
   * Maximum part number number for s3 upload part.
   */
  s3_max_part_number?: bigint;

  /**
   * Max number of requests that can be issued simultaneously before hitting request per second limit. By default (0) equals to `s3_max_put_rps`
   */
  s3_max_put_burst?: bigint;

  /**
   * Limit on S3 PUT request per second rate before throttling. Zero means unlimited.
   */
  s3_max_put_rps?: bigint;

  /**
   * Maximum size for single-operation copy in s3. This setting is used only if s3_allow_multipart_copy is true.
   */
  s3_max_single_operation_copy_size?: bigint;

  /**
   * The maximum size of object to upload using singlepart upload to S3.
   */
  s3_max_single_part_upload_size?: bigint;

  /**
   * The maximum number of retries during single S3 read.
   */
  s3_max_single_read_retries?: bigint;

  /**
   * The maximum number of retries in case of unexpected errors during S3 write.
   */
  s3_max_unexpected_write_error_retries?: bigint;

  /**
   * The maximum size of part to upload during multipart upload to S3.
   */
  s3_max_upload_part_size?: bigint;

  /**
   * The minimum size of part to upload during multipart upload to S3.
   */
  s3_min_upload_part_size?: bigint;

  /**
   * Maximum number of `_path` values that can be extracted from query filters to use for file iteration instead of glob listing. 0 means disabled.
   * @since 26.1
   */
  s3_path_filter_limit?: bigint;

  /**
   * Idleness timeout for sending and receiving data to/from S3. Fail if a single TCP read or write call blocks for this long.
   */
  s3_request_timeout_ms?: bigint;

  /**
   * Enables or disables skipping empty files in [S3](/reference/engines/table-engines/integrations/s3) engine tables. Possible values: - 0 — `SELECT` throws an exception if empty file is not compatible with requested format. - 1 — `SELECT` returns empty result for empty file.
   */
  s3_skip_empty_files?: boolean;

  /**
   * When set to `true`, all threads executing S3 requests to the same backup endpoint are slowed down after any single s3 request encounters a retryable network error, such as socket timeout. When set to `false`, each thread handles S3 request backoff independently of the others.
   * @since 25.6
   */
  s3_slow_all_threads_after_network_error?: boolean;

  /**
   * The exact size of part to upload during multipart upload to S3 (some implementations does not supports variable size parts).
   */
  s3_strict_upload_part_size?: bigint;

  /**
   * Throw an error, when ListObjects request cannot match any files
   */
  s3_throw_on_zero_files_match?: boolean;

  /**
   * Enables or disables truncate before inserts in s3 engine tables. If disabled, an exception will be thrown on insert attempts if an S3 object already exists. Possible values: - 0 — `INSERT` query creates a new file or fail if file exists and s3_create_new_file_on_insert is not set. - 1 — `INSERT` query replaces existing content of the file with the new data. See more details [here](/integrations/connectors/data-ingestion/AWS/integrating-s3-with-clickhouse#inserting-data).
   */
  s3_truncate_on_insert?: boolean;

  /**
   * The checksum algorithm used when ClickHouse uploads data to `S3`. `CRC32` and `SHA256` are sent as flexible `x-amz-checksum-*` headers, while `MD5` is sent as a `Content-MD5` header. By default the value is empty and ClickHouse lets the AWS SDK compute `Content-MD5`. In FIPS mode `MD5` is unavailable, so the SDK silently omits it and the upload carries no checksum at all: set `CRC32` or `SHA256` to attach a flexible checksum instead. Where this setting applies, an explicit `MD5` is then rejected. It takes effect when the `S3` client is created, so it applies to query-scoped uses such as the `s3` table function and `BACKUP ... TO S3`; a later per-query `SET` does not reconfigure an already-created long-lived client such as an `S3` disk. `S3Express` buckets require a flexible checksum and do not accept `Content-MD5`: an explicit `CRC32` or `SHA256` is honored, an empty value uses `CRC32`, and an explicit `MD5` is rejected. `GCS` endpoints (`storage.googleapis.com`) ignore this setting entirely and keep the SDK's `Content-MD5` behavior, because `GCS` rejects `SigV4`-signed requests carrying the AWS `x-amz-checksum-*` headers. Server-side copies ignore this setting.
   * @since 26.10
   */
  s3_upload_checksum_algorithm?: string;

  /**
   * Multiply s3_min_upload_part_size by this factor each time s3_multiply_parts_count_threshold parts were uploaded from a single write to S3.
   */
  s3_upload_part_size_multiply_factor?: bigint;

  /**
   * Each time this number of parts was uploaded to S3, s3_min_upload_part_size is multiplied by s3_upload_part_size_multiply_factor.
   */
  s3_upload_part_size_multiply_parts_count_threshold?: bigint;

  /**
   * Force the s3 endpoint style. Possible values: auto, virtual_hosted, path.
   * @since 26.5
   */
  s3_uri_style?: "auto" | "path" | "virtual_hosted";

  /**
   * When set to `true` than for all s3 requests first two attempts are made with low send and receive timeouts. When set to `false` than all attempts are made with identical timeouts.
   */
  s3_use_adaptive_timeouts?: boolean;

  /**
   * When reading an object from S3 (or an S3-compatible store such as GCS), check that every GET request returns the same ETag that was observed when the object was listed. A single file read issues many ranged GET requests; if the object is overwritten in place between them (for example by an external writer rewriting a fixed key), the reads can otherwise be stitched together from two different object generations and surface as a corrupted checksum or parse error. When a mismatch is detected the read fails with `S3_OBJECT_CHANGED_DURING_READ` instead of returning inconsistent data. Disable only for workloads that intentionally read objects that are being overwritten and can tolerate inconsistent reads.
   * @since 26.8
   */
  s3_validate_etag_on_read?: boolean;

  /**
   * Enables s3 request settings validation. Possible values: - 1 — validate settings. - 0 — do not validate settings.
   */
  s3_validate_request_settings?: boolean;

  /**
   * Default zookeeper path prefix for S3Queue engine
   */
  s3queue_default_zookeeper_path?: string;

  /**
   * Enable writing to system.s3queue_log. The value can be overwritten per table with table settings
   */
  s3queue_enable_logging_to_s3queue_log?: boolean;

  /**
   * Keeper fault injection probability for S3Queue.
   * @since 25.12
   */
  s3queue_keeper_fault_injection_probability?: number;

  /**
   * Migrate old metadata structure of S3Queue table to a new one
   * @since 25.2
   */
  s3queue_migrate_old_metadata_to_buckets?: boolean;

  /**
   * Use schema from cache for URL with last modification time validation (for URLs with Last-Modified header)
   */
  schema_inference_cache_require_modification_time_for_url?: boolean;

  /**
   * Use cache in schema inference while using azure table function
   */
  schema_inference_use_cache_for_azure?: boolean;

  /**
   * Use cache in schema inference while using file table function
   */
  schema_inference_use_cache_for_file?: boolean;

  /**
   * Use cache in schema inference while using hdfs table function
   */
  schema_inference_use_cache_for_hdfs?: boolean;

  /**
   * Use cache in schema inference while using s3 table function
   */
  schema_inference_use_cache_for_s3?: boolean;

  /**
   * Use cache in schema inference while using url table function
   */
  schema_inference_use_cache_for_url?: boolean;

  /**
   * Enable the bulk filtering algorithm for indices. It is expected to be always better, but we have this setting for compatibility and control.
   * @since 26.11
   */
  secondary_indexes_enable_bulk_filtering?: boolean;

  /**
   * Wraps the query as a subquery with an explicit `SELECT` expression list. When non-empty, the result-producing query is wrapped as `SELECT <expr_list> FROM (<query>)`. This is a query-construction setting applied by the engine on the parsed query (wrapping it as a derived table), so it composes with the existing query and works on every protocol: it can be supplied via the HTTP URL parameter, an in-query `SETTINGS` clause, or a user profile. It shapes result-producing `SELECT` / `UNION` queries. For a write query (`INSERT … SELECT`, `CREATE … AS SELECT`) it takes effect only when the source `SELECT` carries it in its own `SETTINGS` clause; a value inherited from a profile or session, or set on the `INSERT` / `CREATE` statement itself, does not propagate into the source `SELECT` — the same non-propagation rule that applies to any other setting.
   * @since 26.9
   */
  select?: string;

  /**
   * <Note> This setting differ in behavior between SharedMergeTree and ReplicatedMergeTree, see [SharedMergeTree consistency](/products/cloud/features/infrastructure/shared-merge-tree#consistency) for more information about the behavior of `select_sequential_consistency` in SharedMergeTree. </Note> Enables or disables sequential consistency for `SELECT` queries. Requires `insert_quorum_parallel` to be disabled (enabled by default). Possible values: - 0 — Disabled. - 1 — Enabled. Usage When sequential consistency is enabled, ClickHouse allows the client to execute the `SELECT` query only for those replicas that contain data from all previous `INSERT` queries executed with `insert_quorum`. If the client refers to a partial replica, ClickHouse will generate an exception. The SELECT query will not include data that has not yet been written to the quorum of replicas. When `insert_quorum_parallel` is enabled (the default), then `select_sequential_consistency` does not work. This is because parallel `INSERT` queries can be written to different sets of quorum replicas so there is no guarantee a single replica will have received all writes. See also: - [insert_quorum](#insert_quorum) - [insert_quorum_timeout](#insert_quorum_timeout) - [insert_quorum_parallel](#insert_quorum_parallel)
   */
  select_sequential_consistency?: bigint;

  /**
   * When enabled (the default), `SEMI` JOIN keeps columns from both sides accessible in the joined result, and `SELECT *` returns columns from both sides. This is the legacy ClickHouse behavior. When disabled, the analyzer restricts `SEMI` JOIN column access to the preserved side in accordance with the SQL standard. For `LEFT SEMI JOIN` only left table columns are accessible, for `RIGHT SEMI JOIN` only right table columns. This applies to expressions resolved from the joined result, such as `SELECT`, `PREWHERE`, `WHERE`, `GROUP BY`, `HAVING`, `QUALIFY`, `ORDER BY`, and `LIMIT BY` clauses, including qualified wildcards like `t1.*`. An explicit reference to a non-preserved side column raises the `SEMI_ANTI_JOIN_COLUMN_ACCESS_DENIED` exception. This covers qualified references such as `t2.b`, qualified wildcards like `t2.*`, `USING` columns like `d.id`, and fully qualified references like `db.table.column`, and it is enforced even inside statically-dead branches such as `if(false, t2.b, 42)`. An unqualified identifier that does not match any accessible column still falls back to the generic `UNKNOWN_IDENTIFIER` exception. The `JOIN ON` expression of the same `JOIN` can access both sides regardless of this setting.
   * @since 26.11
   */
  semi_join_include_columns_from_both_sides?: boolean;

  /**
   * Send server text logs with specified minimum level to client. Valid values: 'test', 'trace', 'debug', 'information', 'warning', 'error', 'fatal', 'none'
   */
  send_logs_level?: string;

  /**
   * Send server text logs with specified regexp to match log source name. Empty means all sources.
   */
  send_logs_source_regexp?: string;

  /**
   * Enables or disables sending of [ProfileEvents](/resources/develop-contribute/native-protocol/protocol#profileevents) packets to the client. This can be disabled to reduce network traffic for clients that do not require profile events. Possible values: - 0 — Disabled. - 1 — Enabled.
   * @since 25.12
   */
  send_profile_events?: boolean;

  /**
   * Enables or disables `X-ClickHouse-Progress` HTTP response headers in `clickhouse-server` responses. For more information, read the [HTTP interface description](/concepts/features/interfaces/http). Possible values: - 0 — Disabled. - 1 — Enabled.
   */
  send_progress_in_http_headers?: boolean;

  /**
   * If disabled and the INSERT query contains inline data, the server will not send the table structure and column defaults back to the client over the native protocol. Instead, the server will parse the inline data itself. This can improve performance for many small inserts over the native protocol.
   * @since 26.6
   */
  send_table_structure_on_insert_with_inline_data?: boolean;

  /**
   * Timeout for sending data to the network, in seconds. If a client needs to send some data but is not able to send any bytes in this interval, the exception is thrown. If you set this setting on the client, the 'receive_timeout' for the socket will also be set on the corresponding connection end on the server.
   */
  send_timeout?: number;

  /**
   * Serialize query plan for distributed processing
   * @since 25.5
   */
  serialize_query_plan?: boolean;

  /**
   * Serialize String values during aggregation with zero byte at the end. Enable to keep compatibility when querying cluster of incompatible versions.
   * @since 26.1
   */
  serialize_string_in_memory_with_zero_byte?: boolean;

  /**
   * The maximum number of query ids kept in the session-local history exposed through the [`system.session_query_ids`](/operations/system-tables/session_query_ids) system table. The query id of every non-internal query executed in the session is recorded there at query start; when the history exceeds this size, the oldest entries are evicted first. The value is read at query start, before the query is parsed, so a `SETTINGS` clause of the query itself does not affect whether that query is recorded; use `SET`, an HTTP URL parameter, or a settings profile instead. Possible values: - Positive integer. - 0 — Recording is disabled; entries recorded earlier stay in the table.
   * @since 26.10
   */
  session_query_ids_history_size?: bigint;

  /**
   * Sets the implicit time zone of the current session or query. The implicit time zone is the time zone applied to values of type DateTime/DateTime64 which have no explicitly specified time zone. The setting takes precedence over the globally configured (server-level) implicit time zone. A value of '' (empty string) means that the implicit time zone of the current session or query is equal to the [server time zone](/reference/settings/server-settings/settings/other#timezone). You can use functions `timeZone()` and `serverTimeZone()` to get the session time zone and server time zone. Possible values: - Any time zone name from `system.time_zones`, e.g. `Europe/Berlin`, `UTC` or `Zulu` - A fixed offset from UTC, spelled `Fixed/UTC±HH:MM:SS`, e.g. `Fixed/UTC+05:30:00`. The offset has to be a whole number of quarters of an hour and no further from UTC than 14 hours, which covers every offset a real time zone has. Only these names are accepted. A name that only the operating system's time zone database has is not, because ClickHouse ships its own copy of the time zone database so that results do not depend on the host. Examples: ```sql SELECT timeZone(), serverTimeZone() FORMAT CSV "Europe/Berlin","Europe/Berlin" ``` ```sql SELECT timeZone(), serverTimeZone() SETTINGS session_timezone = 'Asia/Novosibirsk' FORMAT CSV "Asia/Novosibirsk","Europe/Berlin" ``` Assign session time zone 'America/Denver' to the inner DateTime without explicitly specified time zone: ```sql SELECT toDateTime64(toDateTime64('1999-12-12 23:23:23.123', 3), 3, 'Europe/Zurich') SETTINGS session_timezone = 'America/Denver' FORMAT TSV 1999-12-13 07:23:23.123 ``` <Warning> Not all functions that parse DateTime/DateTime64 respect `session_timezone`. This can lead to subtle errors. See the following example and explanation. </Warning> ```sql CREATE TABLE test_tz (`d` DateTime('UTC')) ENGINE = Memory AS SELECT toDateTime('2000-01-01 00:00:00', 'UTC'); SELECT *, timeZone() FROM test_tz WHERE d = toDateTime('2000-01-01 00:00:00') SETTINGS session_timezone = 'Asia/Novosibirsk' 0 rows in set. SELECT *, timeZone() FROM test_tz WHERE d = '2000-01-01 00:00:00' SETTINGS session_timezone = 'Asia/Novosibirsk' ┌───────────────────d─┬─timeZone()───────┐ │ 2000-01-01 00:00:00 │ Asia/Novosibirsk │ └─────────────────────┴──────────────────┘ ``` This happens due to different parsing pipelines: - `toDateTime()` without explicitly given time zone used in the first `SELECT` query honors setting `session_timezone` and the global time zone. - In the second query, a DateTime is parsed from a String, and inherits the type and time zone of the existing column`d`. Thus, setting `session_timezone` and the global time zone are not honored. **See also** - [timezone](/reference/settings/server-settings/settings/other#timezone)
   */
  session_timezone?: string;

  /**
   * Sets what happens when the amount of data exceeds one of the limits. Possible values: - `throw`: throw an exception (default). - `break`: stop executing the query and return the partial result, as if the source data ran out.
   */
  set_overflow_mode?: "throw" | "break";

  /**
   * Initial backoff in milliseconds for parts update when using `select_sequential_consistency` with `SharedMergeTree`. Only available in ClickHouse Cloud.
   * @since 26.6
   */
  shared_merge_tree_sequential_consistency_initial_parts_update_backoff_ms?: bigint;

  /**
   * Max backoff in milliseconds for parts update when using `select_sequential_consistency` with `SharedMergeTree`. Only available in ClickHouse Cloud.
   * @since 26.6
   */
  shared_merge_tree_sequential_consistency_max_parts_update_backoff_ms?: bigint;

  /**
   * Max retries for parts update when using `select_sequential_consistency` with `SharedMergeTree`. Only available in ClickHouse Cloud.
   * @since 26.6
   */
  shared_merge_tree_sequential_consistency_parts_update_max_retries?: bigint;

  /**
   * Automatically synchronize set of data parts after MOVE|REPLACE|ATTACH partition operations in SMT tables. Cloud only
   * @since 25.2
   */
  shared_merge_tree_sync_parts_on_partition_operations?: boolean;

  /**
   * Allows calculating the [if](/reference/functions/regular-functions/conditional-functions#if), [multiIf](/reference/functions/regular-functions/conditional-functions#multiIf), [and](/reference/functions/regular-functions/logical-functions#and), and [or](/reference/functions/regular-functions/logical-functions#or) functions according to a [short scheme](https://en.wikipedia.org/wiki/Short-circuit_evaluation). This helps optimize the execution of complex expressions in these functions and prevent possible exceptions (such as division by zero when it is not expected). Possible values: - `enable` — Enables short-circuit function evaluation for functions that are suitable for it (can throw an exception or computationally heavy). - `force_enable` — Enables short-circuit function evaluation for all functions. - `disable` — Disables short-circuit function evaluation.
   */
  short_circuit_function_evaluation?: "enable" | "force_enable" | "disable";

  /**
   * Optimizes evaluation of functions that return NULL when any argument is NULL. When the percentage of NULL values in the function's arguments exceeds the short_circuit_function_evaluation_for_nulls_threshold, the system skips evaluating the function row-by-row. Instead, it immediately returns NULL for all rows, avoiding unnecessary computation. This setting controls an optimization only. Functions that cannot be executed on the default value of their arguments - such as `parseDateTime`, `IPv4StringToNum` or `intDiv` - always skip the rows containing a NULL regardless of this setting, because the value stored behind a NULL is the default value of the argument type and executing on it would throw on otherwise valid data.
   * @since 24.12
   */
  short_circuit_function_evaluation_for_nulls?: boolean;

  /**
   * Ratio threshold of NULL values to execute functions with Nullable arguments only on rows with non-NULL values in all arguments. Applies when setting short_circuit_function_evaluation_for_nulls is enabled. When the ratio of rows containing NULL values to the total number of rows exceeds this threshold, these rows containing NULL values will not be evaluated.
   * @since 24.12
   */
  short_circuit_function_evaluation_for_nulls_threshold?: number;

  /**
   * Allows changing the order in which the arguments of the [and](/reference/functions/regular-functions/logical-functions#and) and [or](/reference/functions/regular-functions/logical-functions#or) functions are evaluated with [short-circuit evaluation](#short_circuit_function_evaluation), when it does not change the result and does not introduce exceptions. - If the first argument is computationally heavy and another argument is cheap, the cheap argument is evaluated first, and the heavy one is evaluated only on the rows where the result is not yet decided. For example, in `WHERE JSONExtractString(json, 'a') = 'x' AND id < 100` the JSON is parsed only for the rows with `id < 100`. - The arguments that are evaluated lazily and cannot throw an exception are evaluated in the order of increasing time per row they decide, as measured on the previous blocks. The arguments that can throw an exception keep all the arguments that precede them in front of them, so that, for example, `x != 0 AND intDiv(1, x) > 0` never divides by zero.
   * @since 26.11
   */
  short_circuit_function_evaluation_reorder_arguments?: boolean;

  /**
   * Enables showing data lake catalogs in system tables.
   * @since 25.9
   */
  show_data_lake_catalogs_in_system_tables?: boolean;

  /**
   * Show internal auxiliary processes in the `SHOW PROCESSLIST` query output. Internal processes include dictionary reloads, refreshable materialized view reloads, auxiliary `SELECT`s executed in `SHOW ...` queries, auxiliary `CREATE DATABASE ...` queries executed internally to accommodate broken tables and more.
   * @since 25.12
   */
  show_processlist_include_internal?: boolean;

  /**
   * Enables showing `MySQL` and `PostgreSQL` databases in system tables.
   * @since 26.7
   */
  show_remote_databases_in_system_tables?: boolean;

  /**
   * Sets the `SHOW TABLE` query display. Possible values: - 0 — The query will be displayed without table UUID. - 1 — The query will be displayed with table UUID.
   */
  show_table_uuid_in_table_create_query_if_not_nil?: boolean;

  /**
   * Minimum absolute amount of wasted (reserved but unused) memory in a column, in bytes, for it to be shrunk to fit on INSERT. See [shrink_over_allocated_columns_min_waste_ratio](#shrink_over_allocated_columns_min_waste_ratio). Prevents reallocating columns whose over-allocation is small, where the memory saving would not justify the cost.
   * @since 26.9
   */
  shrink_over_allocated_columns_min_waste_bytes?: bigint;

  /**
   * On INSERT, over-allocated columns (whose reserved memory exceeds the used memory, e.g. due to power-of-two growth of variable-length columns) are shrunk to fit before the expensive materialization and part-writing stages, to reduce peak memory usage. A column is shrunk only when `allocatedBytes() > byteSize() * shrink_over_allocated_columns_min_waste_ratio` and the absolute waste is at least `shrink_over_allocated_columns_min_waste_bytes`. Possible values: - Float greater than 1. - Value less than or equal to 1 disables the shrinking (the default `1.0` keeps it disabled).
   * @since 26.9
   */
  shrink_over_allocated_columns_min_waste_ratio?: number;

  /**
   * For single JOIN in case of identifier ambiguity prefer left table
   */
  single_join_prefer_left_table?: boolean;

  /**
   * Redundant aliases are not used (substituted) in user-defined functions in order to simplify it's usage. Possible values: - 1 — The aliases are skipped (substituted) in UDFs. - 0 — The aliases are not skipped (substituted) in UDFs. **Example** The difference between enabled and disabled: Query: ```sql SET skip_redundant_aliases_in_udf = 0; CREATE FUNCTION IF NOT EXISTS test_03274 AS ( x ) -> ((x + 1 as y, y + 2)); EXPLAIN SYNTAX SELECT test_03274(4 + 2); ``` Result: ```text SELECT ((4 + 2) + 1 AS y, y + 2) ``` Query: ```sql SET skip_redundant_aliases_in_udf = 1; CREATE FUNCTION IF NOT EXISTS test_03274 AS ( x ) -> ((x + 1 as y, y + 2)); EXPLAIN SYNTAX SELECT test_03274(4 + 2); ``` Result: ```text SELECT ((4 + 2) + 1, ((4 + 2) + 1) + 2) ```
   * @since 25.2
   */
  skip_redundant_aliases_in_udf?: boolean;

  /**
   * Enables or disables silently skipping of unavailable shards. The behavior of this setting is controlled by the `skip_unavailable_shards_mode` parameter. Possible values: - 1 — skipping enabled. If a shard is unavailable, ClickHouse returns a result based on partial data and does not report node availability issues. On a read, if *every* shard was skipped before returning any data there is no partial data left to return, so the query throws `ALL_CONNECTION_TRIES_FAILED` instead of returning an empty result. This check covers reads only; `INSERT` has its own handling of a fully unavailable destination cluster. - 0 — skipping disabled. If a shard is unavailable, ClickHouse throws an exception.
   */
  skip_unavailable_shards?: boolean;

  /**
   * Controls which exceptions from a remote shard are silently ignored when `skip_unavailable_shards` is enabled. The setting has no effect when `skip_unavailable_shards = 0`. Possible values: - `unavailable` — Only connection-related errors are ignored. A shard is considered unavailable when ClickHouse cannot connect to any of its replicas, or when a replica's hostname cannot be resolved through DNS. - `unavailable_or_table_missing` — In addition to `unavailable`, errors caused by a missing table or database on the shard are ignored. This is useful while a table is being created or dropped across a cluster. This is the default and matches the historical behavior of `skip_unavailable_shards`, which also treated a shard whose table does not exist as unavailable. - `unavailable_or_exception_before_processing` — In addition to `unavailable`, any exception received from a shard before it returned any data block to the initiator is ignored. An exception that arrives after the shard already returned some data is always rethrown. Note that "before it returned any data" is checked at the initiator: a shard that performs a blocking computation (for example an aggregation, sort, or `LIMIT BY`) may process rows and fail before emitting any block, in which case its partial work is silently discarded and the query returns a result built from the remaining shards. This is therefore the most permissive mode and should be used with care.
   * @since 26.8
   */
  skip_unavailable_shards_mode?:
    | "unavailable"
    | "unavailable_or_table_missing"
    | "unavailable_or_exception_before_processing";

  /**
   * Time to sleep after receiving query in TCPHandler
   */
  sleep_after_receiving_query_ms?: number;

  /**
   * Time to sleep in sending data in TCPHandler
   */
  sleep_in_send_data_ms?: number;

  /**
   * Time to sleep in sending tables status response in TCPHandler
   */
  sleep_in_send_tables_status_ms?: number;

  /**
   * Controls the wire format used for snappy compression for generic file I/O paths such as `file` and `url`. HTTP `Content-Encoding: snappy` always uses the framing format and ignores this setting. Note that the raw snappy block format produced by a single `snappy::Compress` call (for example, the Prometheus remote protocol payloads handled by `SnappyBasicReadBuffer`) is a separate, protocol-specific wire format and is not controlled by this setting. Possible values: - `basic` — Hadoop snappy block format. Compatible with files read and written by Hadoop. Supports both reading and writing. - `framed` — Snappy framing format, the standard streaming format defined by Google. Supports both reading and writing.
   * @since 26.8
   */
  snappy_mode?: "basic" | "framed";

  /**
   * Adds a simple `ORDER BY` clause to the query as a wrapping subquery. Accepts a comma-separated list of identifiers or positional column references (positive integers) with an optional `+` (ASC) or `-` (DESC) prefix. Example: `sort=a,-b` orders by `a` ascending and `b` descending; `sort=1,-2` orders by the first column ascending and the second descending. Cannot be combined with `order`. This is a query-construction setting applied by the engine on the parsed query (wrapping it as a derived table), so it composes with the existing query and works on every protocol: it can be supplied via the HTTP URL parameter, an in-query `SETTINGS` clause, or a user profile. It shapes result-producing `SELECT` / `UNION` queries. For a write query (`INSERT … SELECT`, `CREATE … AS SELECT`) it takes effect only when the source `SELECT` carries it in its own `SETTINGS` clause; a value inherited from a profile or session, or set on the `INSERT` / `CREATE` statement itself, does not propagate into the source `SELECT` — the same non-propagation rule that applies to any other setting.
   * @since 26.9
   */
  sort?: string;

  /**
   * Sets what happens if the number of rows received before sorting exceeds one of the limits. Possible values: - `throw`: throw an exception. - `break`: stop executing the query and return the partial result.
   */
  sort_overflow_mode?: "throw" | "break";

  /**
   * Split intersecting parts ranges into layers during FINAL optimization
   */
  split_intersecting_parts_ranges_into_layers_final?: boolean;

  /**
   * Split parts ranges into intersecting and non intersecting during FINAL optimization
   */
  split_parts_ranges_into_intersecting_and_non_intersecting_final?: boolean;

  /**
   * Controls whether function [splitBy*()](/reference/functions/regular-functions/splitting-merging-functions) with argument `max_substrings` > 0 will include the remaining string in the last element of the result array. Possible values: - `0` - The remaining string will not be included in the last element of the result array. - `1` - The remaining string will be included in the last element of the result array. This is the behavior of Spark's [`split()`](https://spark.apache.org/docs/latest/api/python/reference/pyspark.sql/api/pyspark.sql.functions.split.html) function and Python's ['string.split()'](https://docs.python.org/3/library/stdtypes.html#str.split) method.
   */
  splitby_max_substrings_includes_remaining_string?: boolean;

  /**
   * The maximum size of the set in the right-hand side of the `IN` operator for which the selectivity estimator derives the exact ranges covered by the set. Deriving them costs a `Field` per element, a sort, and one statistics probe per element, which for a large set dominates query planning. Above this limit the estimator instead derives the selectivity from the size of the set and its bounding range, which is a single linear pass over the set without the sort or the per-element statistics probes. Zero means no limit.
   * @since 26.9
   */
  statistics_max_set_size_for_exact_selectivity_estimation?: bigint;

  /**
   * On server startup, prevent scheduling of refreshable materialized views, as if with SYSTEM STOP VIEWS. You can manually start them with `SYSTEM START VIEWS` or `SYSTEM START VIEW <name>` afterwards. Also applies to newly created views. Has no effect on non-refreshable materialized views.
   */
  stop_refreshable_materialized_views_on_startup?: boolean;

  /**
   * Method of reading data from storage file, one of: `read`, `pread`, `mmap`. The mmap method does not apply to clickhouse-server (it's intended for clickhouse-local).
   */
  storage_file_read_method?: string;

  /**
   * Maximum time to read from a pipe for receiving information from the threads when querying the `system.stack_trace` table. This setting is used for testing purposes and not meant to be changed by users.
   */
  storage_system_stack_trace_pipe_read_timeout_ms?: number;

  /**
   * Works for tables with streaming in the case of a timeout, or when a thread generates [max_insert_block_size](#max_insert_block_size) rows. The default value is 7500. The smaller the value, the more often data is flushed into the table. Setting the value too low leads to poor performance.
   */
  stream_flush_interval_ms?: number;

  /**
   * Allow direct SELECT query for Kafka, RabbitMQ, FileLog, Redis Streams, S3Queue, AzureQueue and NATS engines. In case there are attached materialized views, SELECT query is not allowed even if this setting is enabled. If there are no attached materialized views, enabling this setting allows to read data. Be aware that usually the read data is removed from the queue. In order to avoid removing read data the related engine settings should be configured properly.
   */
  stream_like_engine_allow_direct_select?: boolean;

  /**
   * When stream-like engine reads from multiple queues, the user will need to select one queue to insert into when writing. Used by Redis Streams and NATS.
   */
  stream_like_engine_insert_queue?: string;

  /**
   * Timeout for polling data from/to streaming storages.
   */
  stream_poll_timeout_ms?: number;

  /**
   * Allows to select zero-valued events from [`system.events`](/reference/system-tables/events). Some monitoring systems require passing all the metrics values to them for each checkpoint, even if the metric value is zero. Possible values: - 0 — Disabled. - 1 — Enabled. **Examples** Query ```sql SELECT * FROM system.events WHERE event='QueryMemoryLimitExceeded'; ``` Result ```text Ok. ``` Query ```sql SET system_events_show_zero_values = 1; SELECT * FROM system.events WHERE event='QueryMemoryLimitExceeded'; ``` Result ```text ┌─event────────────────────┬─value─┬─description───────────────────────────────────────────┐ │ QueryMemoryLimitExceeded │ 0 │ Number of times when memory limit exceeded for query. │ └──────────────────────────┴───────┴───────────────────────────────────────────────────────┘ ```
   */
  system_events_show_zero_values?: boolean;

  /**
   * Controls whether zero-valued histogram data is written to the `histograms` nested column of `system.metric_log`. By default, histograms whose total observation `count` is zero are skipped, and within each emitted histogram, bucket entries with no observations are also omitted from the `histogram` map. Enable this to write every histogram and every bucket regardless of count — useful for monitoring systems that require every metric to appear at every checkpoint. Possible values: - 0 — Disabled. Histograms with `count = 0` are not emitted; emitted histograms include only buckets that received at least one observation. - 1 — Enabled. All histograms are written, and every bucket boundary appears in `histogram`.
   * @since 26.6
   */
  system_metric_log_show_zero_values_in_histograms?: boolean;

  /**
   * Only has an effect in ClickHouse Cloud. Allow reading from distributed cache via table engines / table functions (s3, azure, etc). The cache is keyed on the object's ETag, so that an object overwritten in place is not served stale. An object whose ETag is missing or is not a strong content identifier is read from the object storage directly.
   * @since 25.8
   */
  table_engine_read_through_distributed_cache?: boolean;

  /**
   * Sets the maximum number of addresses generated from patterns for the [remote](/reference/functions/table-functions/remote) function. Possible values: - Positive integer.
   */
  table_function_remote_max_addresses?: bigint;

  /**
   * The time in seconds the connection needs to remain idle before TCP starts sending keepalive probes
   */
  tcp_keep_alive_timeout?: number;

  /**
   * Wait time to lock cache for space reservation for temporary data in filesystem cache
   */
  temporary_data_in_cache_reserve_space_wait_lock_timeout_milliseconds?: bigint;

  /**
   * Sets compression codec for temporary files used in sorting and joining operations on disk. Possible values: - LZ4 — [LZ4](https://en.wikipedia.org/wiki/LZ4_(compression_algorithm)) compression is applied. - NONE — No compression is applied.
   */
  temporary_files_codec?: string;

  /**
   * Maximal selectivity of the filter to use the hint built from the inverted text index.
   * @since 26.1
   */
  text_index_hint_max_selectivity?: number;

  /**
   * Maximum number of large postings to read when text index LIKE evaluation by the dictionary scan is enabled. Requires `use_text_index_like_evaluation_by_dictionary_scan` to be enabled.
   * @since 26.5
   */
  text_index_like_max_postings_to_read?: bigint;

  /**
   * Minimum length of the alphanumeric needle in a LIKE/ILIKE pattern, or of a `startsWith`/`endsWith` needle, required to use the text index LIKE evaluation by the dictionary scan. Patterns shorter than this threshold match too many dictionary tokens and are skipped to avoid expensive scans. With the `array` tokenizer, where any pattern qualifies, the threshold is compared against the number of non-wildcard characters in the whole pattern. Requires `use_text_index_like_evaluation_by_dictionary_scan` to be enabled.
   * @since 26.5
   */
  text_index_like_min_pattern_length?: bigint;

  /**
   * Controls how posting lists are applied during text index queries. 'materialize' eagerly decodes posting lists into Roaring Bitmaps. 'lazy' (default) uses cursor-based on-demand decoding (requires an index format with a serialized codec). 'lazy' is applied only where it is supported: queries with patterns (such as `LIKE`) and parts with an index written by an older version fall back to 'materialize'.
   * @since 26.7
   */
  text_index_posting_list_apply_mode?: "materialize" | "lazy";

  /**
   * Selects the algorithm that intersects posting lists in lazy posting list apply mode (`text_index_posting_list_apply_mode = 'lazy'`). - `auto` (default): leapfrog is used only when the sparsest posting list can skip whole packed blocks of the densest one, and brute-force bitmap intersection otherwise. - `bruteforce`: always use the brute-force bitmap intersection. - `leapfrog`: always use the leapfrog intersection. Intersections of 256 or more tokens always use leapfrog.
   * @since 26.11
   */
  text_index_postings_intersection_algorithm?: "bruteforce" | "leapfrog" | "auto";

  /**
   * Allows or forbids empty INSERTs, enabled by default (throws an error on an empty insert). Only applies to INSERTs using [`clickhouse-client`](/concepts/features/interfaces/client) or using the [gRPC interface](/concepts/features/interfaces/grpc).
   */
  throw_if_no_data_to_insert?: boolean;

  /**
   * Ignore error from cache when caching on write operations (INSERT, merges)
   */
  throw_on_error_from_cache_on_write_operations?: boolean;

  /**
   * Throw an exception instead of logging a warning when Hive-style partitioning detection for an object storage table fails to list the storage. When disabled, the query runs without the Hive partition columns, which may change its result.
   * @since 26.9
   */
  throw_on_hive_partitioning_resolution_failure?: boolean;

  /**
   * Allows you to control the behaviour when `max_partitions_per_insert_block` is reached. Possible values: - `true` - When an insert block reaches `max_partitions_per_insert_block`, an exception is raised. - `false` - Logs a warning when `max_partitions_per_insert_block` is reached. <Tip> This can be useful if you're trying to understand the impact on users when changing [`max_partitions_per_insert_block`](/reference/settings/session-settings/max-partitions#max_partitions_per_insert_block). </Tip>
   */
  throw_on_max_partitions_per_insert_block?: boolean;

  /**
   * Throw exception if unsupported query is used inside transaction
   */
  throw_on_unsupported_query_inside_transaction?: boolean;

  /**
   * Read from the recent samples table of a [TimeSeries](/reference/engines/table-engines/integrations/time-series) table instead of the main samples table when the whole requested time range fits in the TTL window of the recent samples table (see the `recent_samples_ttl_seconds` setting of the TimeSeries table engine).
   * @since 26.9
   */
  time_series_prefer_recent_samples_table?: boolean;

  /**
   * Checks that execution speed is not too slow (no less than `min_execution_speed`), after the specified time in seconds has expired.
   */
  timeout_before_checking_execution_speed?: number;

  /**
   * Sets what to do if the query is run longer than the `max_execution_time` or the estimated running time is longer than `max_estimated_execution_time` (the estimate is only checked with `throw`). Possible values: - `throw`: throw an exception (default). - `break`: stop executing the query and return the partial result, as if the source data ran out. Some operations cannot return a partial result safely, so instead of a smaller result they stop without producing one. A function computing a single value stops without producing that value; whether the stop also reaches the client as a `TIMEOUT_EXCEEDED` error, or only as a missing result, depends on where the query was interrupted. A `Memory`-table mutation left incomplete by the timeout keeps the table unchanged and reports `TIMEOUT_EXCEEDED`. An `INSERT` may report `QUERY_WAS_CANCELLED`. Some operations that wait for other replicas or for background work do not stop at `max_execution_time` at all: a quorum write keeps waiting until its quorum is satisfied, or reports `UNKNOWN_STATUS_OF_INSERT` if `insert_quorum_timeout` elapses first.
   */
  timeout_overflow_mode?: "throw" | "break";

  /**
   * Sets what happens when the query in leaf node run longer than `max_execution_time_leaf`. Possible values: - `throw`: throw an exception (default). - `break`: stop executing the query and return the partial result, as if the source data ran out. Some operations cannot return a partial result safely, so instead of a smaller result they stop without producing one: a function computing a single value stops without producing that value. Whether such a stop also reaches the client as a `TIMEOUT_EXCEEDED` error, or only as a missing result, depends on where the query was interrupted.
   */
  timeout_overflow_mode_leaf?: "throw" | "break";

  /**
   * The threshold for `totals_mode = 'auto'`. See the section "WITH TOTALS modifier".
   */
  totals_auto_threshold?: number;

  /**
   * How to calculate TOTALS when HAVING is present, as well as when max_rows_to_group_by and group_by_overflow_mode = 'any' are present. See the section "WITH TOTALS modifier".
   */
  totals_mode?:
    | "before_having"
    | "after_having_exclusive"
    | "after_having_inclusive"
    | "after_having_auto";

  /**
   * Enables or disables collecting stacktraces on each update of profile events along with the name of profile event and the value of increment and sending them into [trace_log](/reference/system-tables/trace_log). Possible values: - 1 — Tracing of profile events enabled. - 0 — Tracing of profile events disabled.
   */
  trace_profile_events?: boolean;

  /**
   * When the setting `trace_profile_events` is enabled, limit the traced events to the specified list of comma-separated names. If the `trace_profile_events_list` is an empty string (by default), trace all profile events. Example value: 'DiskS3ReadMicroseconds,DiskS3ReadRequestsCount,SelectQueryTimeMicroseconds,ReadBufferFromS3Bytes' Using this setting allows more precise collection of data for a large number of queries, because otherwise the vast amount of events can overflow the internal system log queue and some portion of them will be dropped. The names are checked against [`system.events`](/reference/system-tables/events), and a query fails if the list mentions an event that does not exist.
   * @since 26.2
   */
  trace_profile_events_list?: string;

  /**
   * Sets what happens when the amount of data exceeds one of the limits. Possible values: - `throw`: throw an exception (default). - `break`: stop executing the query and return the partial result, as if the source data ran out.
   */
  transfer_overflow_mode?: "throw" | "break";

  /**
   * Enables equality of [NULL](/reference/syntax#null) values for [IN](/reference/statements/in) operator. By default, `NULL` values can't be compared because `NULL` means undefined value. Thus, comparison `expr = NULL` must always return `false`. With this setting `NULL = NULL` returns `true` for `IN` operator. Possible values: - 0 — Comparison of `NULL` values in `IN` operator returns `false`. - 1 — Comparison of `NULL` values in `IN` operator returns `true`. **Example** Consider the `null_in` table: ```text ┌──idx─┬─────i─┐ │ 1 │ 1 │ │ 2 │ NULL │ │ 3 │ 3 │ └──────┴───────┘ ``` Query: ```sql SELECT idx, i FROM null_in WHERE i IN (1, NULL) SETTINGS transform_null_in = 0; ``` Result: ```text ┌──idx─┬────i─┐ │ 1 │ 1 │ └──────┴──────┘ ``` Query: ```sql SELECT idx, i FROM null_in WHERE i IN (1, NULL) SETTINGS transform_null_in = 1; ``` Result: ```text ┌──idx─┬─────i─┐ │ 1 │ 1 │ │ 2 │ NULL │ └──────┴───────┘ ``` **See Also** - [NULL Processing in IN Operators](/reference/statements/in#null-processing)
   */
  transform_null_in?: boolean;

  /**
   * Traverse frozen data (shadow directory) in addition to actual table data when query system.remote_data_paths
   */
  traverse_shadow_remote_data_paths?: boolean;

  /**
   * Sets a mode for combining `SELECT` query results. The setting is only used when shared with [UNION](/reference/statements/select/union) without explicitly specifying the `UNION ALL` or `UNION DISTINCT`. Possible values: - `'DISTINCT'` — ClickHouse outputs rows as a result of combining queries removing duplicate rows. - `'ALL'` — ClickHouse outputs all rows as a result of combining queries including duplicate rows. - `''` — ClickHouse generates an exception when used with `UNION`. See examples in [UNION](/reference/statements/select/union).
   */
  union_default_mode?: "ALL" | "DISTINCT";

  /**
   * Maximum size (in bytes) of the order-preserving binary encoding of a single `UNIQUE KEY` row.
   * @since 26.7
   */
  unique_key_max_encoded_size?: bigint;

  /**
   * Selects the UNIQUE KEY write-path probe implementation. Currently only a single-threaded baseline exists, so `auto` and `simple` both resolve to it. Reserved: this setting has no effect yet — the value is not read until the UNIQUE KEY INSERT write path that constructs the probe is wired up. Declared now so the lever ships with the implementation.
   * @since 26.9
   */
  unique_key_probe_implementation?: "auto" | "simple";

  /**
   * Send unknown packet instead of data Nth data packet
   */
  unknown_packet_in_send_data?: bigint;

  /**
   * Determines the behavior of concurrent update queries. Possible values: - `sync` - run sequentially all `UPDATE` queries. - `auto` - run sequentially only `UPDATE` queries with dependencies between columns updated in one query and columns used in expressions of another query. - `async` - do not synchronize update queries.
   * @since 25.6
   */
  update_parallel_mode?: "sync" | "async" | "auto";

  /**
   * If true set of parts is updated to the latest version before execution of update.
   * @since 25.6
   */
  update_sequential_consistency?: boolean;

  /**
   * The base URL used to resolve relative URLs in the [url](/reference/functions/table-functions/url) table function and the [URL](/reference/engines/table-engines/special/url) table engine. When set, relative URLs are resolved as follows: - Path-relative URL (e.g. `data.csv`): merged with the base URL path per RFC 3986. Everything after the last `/` in the base path is replaced by the relative URL, so a trailing slash matters: `https://example.com/dir/` + `data.csv` = `https://example.com/dir/data.csv`, but `https://example.com/dir` + `data.csv` = `https://example.com/data.csv`. If the base has no path (e.g. `https://example.com`), a `/` is inserted: `https://example.com/data.csv`. Dot segments (`./` and `../`) in the relative URL are normalized: `https://example.com/dir/` + `../a.csv` = `https://example.com/a.csv`. - Host-relative URL (e.g. `/test/data.csv`): resolved against the base URL's scheme and host. - Scheme-relative URL (e.g. `//other.com/test/data.csv`): resolved using the base URL's scheme. - Query-only reference (e.g. `?x=1`): appended to the base URL path (replacing any existing query/fragment). - Fragment-only reference (e.g. `#frag`): appended to the base URL, preserving any query string (replacing any existing fragment). - Empty reference: returns the base URL without fragment. - If the base URL is only a scheme (e.g. `file://`), a path-relative URL is appended to it directly: `file://` + `data.csv` = `file://data.csv`, which for the `file://` scheme means a path relative to the user_files directory (the current directory for clickhouse-local). Dot segments are kept as-is in this case, so the target engine resolves them against its own base directory. For example, if `url_base` is `https://example.com/def/`, then: - `data.csv` resolves to `https://example.com/def/data.csv` - `/test/data.csv` resolves to `https://example.com/test/data.csv` - `//other.com/test/data.csv` resolves to `https://other.com/test/data.csv` When the relative URL comes from a [named collection](/concepts/features/configuration/server-config/named-collections), resolving it counts as an override of the `url` key of the collection and requires the `SHOW NAMED COLLECTIONS SECRETS` privilege on that collection.
   * @since 26.6
   */
  url_base?: string;

  /**
   * Maximum number of directories that can be traversed while expanding URL wildcards from index pages.
   * @since 26.8
   */
  url_wildcard_max_directories_to_read?: bigint;

  /**
   * Measure the size of the aggregation state compared with `group_by_two_level_threshold_bytes` with the memory tracker dedicated to the aggregation. When disabled, the size is measured as the growth of the memory usage of the whole query since the aggregation was created, so an aggregation with a small state can be converted to two-level.
   * @since 26.11
   */
  use_aggregation_memory_tracker?: boolean;

  /**
   * Use async and potentially multithreaded execution of materialized view query, can speedup views processing during INSERT, but also consume more memory.
   * @since 25.1
   */
  use_async_executor_for_materialized_views?: boolean;

  /**
   * Enables caching of rows number during count from files in table functions `file`/`s3`/`url`/`hdfs`/`azureBlobStorage`. Enabled by default.
   */
  use_cache_for_count_from_files?: boolean;

  /**
   * Use client timezone for interpreting DateTime string values, instead of adopting server timezone.
   */
  use_client_time_zone?: boolean;

  /**
   * Whether to use the columns cache. Accepts 0 or 1. By default, 0 (disabled). The columns cache stores deserialized columns from `MergeTree` tables, eliminating repeated decompression and deserialization for hot data. This can significantly reduce latency for repeated queries on the same data. The cache is keyed by table UUID, data part name, column name, and a stripe of consecutive granules of about 65536 rows. Because entries are keyed by table UUID, the cache is only active for tables in databases that assign UUIDs, such as `Atomic`, `Replicated`, and `Shared` (the default database engine in ClickHouse Cloud); `MergeTree` tables in legacy `Ordinary` databases have a nil UUID and silently ignore this setting. The cache currently applies to wide parts only: data in compact parts is not read from or written to the columns cache, so whether a read is accelerated depends on the part format. An entry holds a contiguous range of granules of one stripe: a granule enters the cache only after it has been read from its first row to its last, a read is served from the cache granule by granule, and ranges written by different reads are merged, so reads that cut a part into different mark ranges share the entries.
   * @since 26.11
   */
  use_columns_cache?: boolean;

  /**
   * Respect the server's concurrency control (see the `concurrent_threads_soft_limit_num` and `concurrent_threads_soft_limit_ratio_to_cores` global server settings). If disabled, it allows using a larger number of threads even if the server is overloaded (not recommended for normal usage, and needed mostly for tests).
   */
  use_concurrency_control?: boolean;

  /**
   * Choose the parallelism of a query (the number of streams and threads it is planned with) from the fair share of CPU slots of the server's concurrency control, instead of the number of CPU cores. The fair share is the slot limit (see the `concurrent_threads_soft_limit_num` and `concurrent_threads_soft_limit_ratio_to_cores` global server settings) divided evenly between the currently running pipelines and the new query. This way, when many queries run concurrently, each of them is planned with fewer streams: it uses less memory and spends less CPU on merging the partial results of its threads (e.g. aggregation states), which increases the total throughput. A query that is planned while the server is idle uses all CPU cores as before. It only applies if `max_threads` is `auto` (not set explicitly) and `use_concurrency_control` is enabled.
   * @since 26.11
   */
  use_concurrency_control_for_max_threads?: boolean;

  /**
   * Substitute partition-level constants into the filter predicate when analyzing per-part primary key and skip indexes. When the partition key appears in the filter together with primary-key or skip-index columns, this lets index analysis fold the partition value separately within each part. It is most useful for disjunctive filters whose branches target different partitions. For example, with `PARTITION BY a` and `ORDER BY b`: ```sql SELECT * FROM t WHERE (a = 1 AND b >= 1) OR (a = 2 AND b > 10) OR (a = 3 AND b > 10) ``` For the part in partition `a = 1` the condition folds to `b >= 1`, while for partitions `a = 2` and `a = 3` it folds to `b > 10`, so each part is analyzed with the predicate that actually applies to it. Possible values: - 0 — Disabled. - 1 — Enabled.
   * @since 26.8
   */
  use_constant_folding_in_index_analysis?: boolean;

  /**
   * Enable using collected hash table statistics for cardinality estimation during join reordering
   * @since 26.2
   */
  use_hash_table_stats_for_join_reordering?: boolean;

  /**
   * Enables hedged requests logic for remote queries. It allows to establish many connections with different replicas for query. New connection is enabled in case existent connection(s) with replica(s) were not established within `hedged_connection_timeout` or no data was received within `receive_data_timeout`. Query uses the first connection which send non empty progress packet (or data packet, if `allow_changing_replica_until_first_data_packet`); other connections are cancelled. Queries with `max_parallel_replicas > 1` are supported. Enabled by default. Cloud default value: `0`.
   */
  use_hedged_requests?: boolean;

  /**
   * When enabled, ClickHouse will detect Hive-style partitioning in path (`/name=value/`) in file-like table engines [File](/reference/functions/table-functions/file#hive-style-partitioning)/[S3](/reference/functions/table-functions/s3#hive-style-partitioning)/[URL](/reference/functions/table-functions/url#hive-style-partitioning)/[HDFS](/reference/functions/table-functions/hdfs#hive-style-partitioning)/[AzureBlobStorage](/reference/functions/table-functions/azureBlobStorage#hive-style-partitioning) and will allow to use partition columns as virtual columns in the query. These virtual columns will have the same names as in the partitioned path, but starting with `_`.
   */
  use_hive_partitioning?: boolean;

  /**
   * Skip whole Iceberg manifest files whose partition summaries in the manifest list cannot match the query filter, without reading them. Requires [use_iceberg_partition_pruning](#use_iceberg_partition_pruning) to be enabled and only helps when a manifest file holds few distinct partition values, which is what `rewriteManifests` clustered by the partition columns produces.
   * @since 26.10
   */
  use_iceberg_manifest_list_partition_pruning?: boolean;

  /**
   * If turned on, iceberg table function and iceberg storage may utilize the iceberg metadata files cache. Possible values: - 0 - Disabled - 1 - Enabled
   * @since 25.5
   */
  use_iceberg_metadata_files_cache?: boolean;

  /**
   * Use Iceberg partition pruning for Iceberg tables
   * @since 25.2
   */
  use_iceberg_partition_pruning?: boolean;

  /**
   * Try using an index if there is a subquery or a table expression on the right side of the IN operator.
   */
  use_index_for_in_with_subqueries?: boolean;

  /**
   * The maximum size of the set in the right-hand side of the IN operator to use table index for filtering. It allows to avoid performance degradation and higher memory usage due to the preparation of additional data structures for large queries. Zero means no limit.
   */
  use_index_for_in_with_subqueries_max_values?: bigint;

  /**
   * Apply indexes evaluated at data-read time already inside MergeTree read pools: mark ranges fully filtered out by skip indexes (see `use_skip_indexes_on_data_read`) or by the projection index (see `optimize_use_projection_filtering`) are dropped before a read task is created for them, instead of being skipped granule by granule during reading. In the prefetched read pool the dropped ranges are never prefetched, but the task boundaries and the prefetch admission by `filesystem_prefetch_max_memory_usage` / `filesystem_prefetches_limit` are still decided before the filtering, so under highly selective filters the surviving tasks may be smaller than the intended task size and the admission may be conservative.
   * @since 26.9
   */
  use_indexes_refiner_in_read_pools?: boolean;

  /**
   * Enable pushing OR-connected parts of JOIN conditions down to the corresponding input sides ("partial pushdown"). This allows storage engines to filter earlier, which can reduce data read. The optimization is semantics-preserving and is applied only when each top-level OR branch contributes at least one deterministic predicate for the target side.
   * @since 25.11
   */
  use_join_disjunctions_push_down?: boolean;

  /**
   * When enabled, the name `toTime` refers to the legacy [`toTime`](/reference/functions/regular-functions/date-time-functions#toTimeWithFixedDate) function, which converts a date with time to a certain fixed date, while preserving the time. Otherwise, the name refers to the new [`toTime`](/reference/functions/regular-functions/type-conversion-functions#toTime) function, which converts values of different types into the [`Time`](/reference/data-types/time) type. The legacy function is also unconditionally accessible as `toTimeWithFixedDate`, regardless of this setting. While this setting is enabled, use `CAST(x AS Time)` or `x::Time` to convert to the `Time` type.
   * @since 25.6
   */
  use_legacy_to_time?: boolean;

  /**
   * Optimize primary key index analysis for `MergeTree` tables with long primary keys. When enabled, the run time of index analysis mainly depends on the complexity of the query's filter (the key columns it actually uses), not on the length of the primary key — so extending the sorting key has negligible extra overhead on index analysis for queries that filter on only a few of its columns. Possible values: - 0 — Disabled. All primary key columns are processed during index analysis. - 1 — Enabled.
   * @since 26.7
   */
  use_lightweight_primary_key_index_analysis?: boolean;

  /**
   * Use userspace page cache for remote disks that don't have filesystem cache enabled.
   */
  use_page_cache_for_disks_without_file_cache?: boolean;

  /**
   * Use userspace page cache when reading from local disks. Used for testing, unlikely to improve performance in practice. Requires local_filesystem_read_method = 'pread' or 'read'. Doesn't disable the OS page cache; min_bytes_to_use_direct_io can be used for that. Only affects regular tables, not file() table function or File() table engine.
   * @since 26.3
   */
  use_page_cache_for_local_disks?: boolean;

  /**
   * Use userspace page cache when reading from object storage table functions (s3, azure, hdfs) and table engines (S3, Azure, HDFS).
   * @since 26.3
   */
  use_page_cache_for_object_storage?: boolean;

  /**
   * Use userspace page cache when distributed cache is used.
   * @since 25.4
   */
  use_page_cache_with_distributed_cache?: boolean;

  /**
   * If turned on, paimon table function and paimon storage may utilize the paimon metadata files cache. Paimon table functions evaluate this setting per query, while persistent Paimon table engines latch it at metadata initialization: to change the decision for an already-created table, it must be dropped and recreated. Possible values: - 0 - Disabled - 1 - Enabled
   * @since 26.8
   */
  use_paimon_metadata_files_cache?: boolean;

  /**
   * Use Paimon partition pruning for Paimon table functions
   * @since 26.1
   */
  use_paimon_partition_pruning?: boolean;

  /**
   * If turned on, parquet format may utilize the parquet metadata cache. Possible values: - 0 - Disabled - 1 - Enabled
   * @since 26.4
   */
  use_parquet_metadata_cache?: boolean;

  /**
   * Use partition minmax index bounds to prune more granules during primary key analysis for `MergeTree` tables, when a primary key column is also an input column of the partition key. For example, in a `MergeTree` table with `ORDER BY (id, event_time)` and `PARTITION BY toYYYYMM(event_time)`, ClickHouse will use the partition minmax index on `event_time` during primary key index analysis to make more informed granule-pruning decisions. Possible values: - 0 — Disabled. - 1 — Enabled.
   * @since 26.8
   */
  use_partition_minmax_for_primary_key_pruning?: boolean;

  /**
   * Use partition key to prune partitions during query execution for MergeTree tables. Possible values: - 0 — Disabled. - 1 — Enabled.
   * @since 26.4
   */
  use_partition_pruning?: boolean;

  /**
   * Use the primary key to prune granules during query execution for MergeTree tables. Possible values: - 0 — Disabled. - 1 — Enabled.
   * @since 26.2
   */
  use_primary_key?: boolean;

  /**
   * If turned on, `SELECT` queries may utilize the [query cache](/concepts/features/performance/caches/query-cache). Parameters [enable_reads_from_query_cache](#enable_reads_from_query_cache) and [enable_writes_to_query_cache](#enable_writes_to_query_cache) control in more detail how the cache is used. Possible values: - 0 - Disabled - 1 - Enabled
   */
  use_query_cache?: boolean;

  /**
   * Enable the [query condition cache](/concepts/features/performance/caches/query-condition-cache). The cache stores ranges of granules in data parts which do not satisfy the condition in the `WHERE` clause, and reuse this information as an ephemeral index for subsequent queries. Possible values: - 0 - Disabled - 1 - Enabled
   * @since 25.4
   */
  use_query_condition_cache?: boolean;

  /**
   * Enable the [query condition cache](/concepts/features/performance/caches/query-condition-cache) for conditions that involve the current time, e.g. `WHERE time >= now() - INTERVAL 10 DAY`, when reading from `MergeTree` tables. Reads from files and object storage (`file`, `s3`, and similar) use the query condition cache only for deterministic conditions and are not affected by this setting. Such conditions are non-deterministic (they change with the clock), so they cannot be cached directly. Instead, a deterministic condition is derived from them by rounding the folded current-time constant onto a time grid, e.g. `WHERE time >= '2026-08-09 12:34:56'` becomes `WHERE time >= '2026-08-09 00:00:00'` (rounding down for cache reads, up for cache writes, which keeps the cache sound). The grid step is proportional to the distance between the constant and the current time (see [`query_condition_cache_time_condition_grid_factor`](#query_condition_cache_time_condition_grid_factor)), clamped to between one second and one day. If the constant is already aligned to the grid (e.g. `WHERE time >= today() - 10` or `WHERE time >= toStartOfDay(now())`), the cache is effective for the whole grid cell, e.g. until the end of the day. Otherwise, the cache is reused only for lower bounds on the time, e.g. `WHERE time >= now() - INTERVAL 10 DAY`: cache entries written during one grid cell are used during the next one. An unaligned upper bound such as `WHERE time < now()`, alone or as a part of a sliding window like `WHERE time >= now() - INTERVAL 10 DAY AND time < now()`, is not reused by later queries, because their condition is not contained in the condition of the earlier ones. This setting has no effect unless `use_query_condition_cache` is also enabled. Possible values: - 0 - Disabled - 1 - Enabled
   * @since 26.11
   */
  use_query_condition_cache_for_time_conditions?: boolean;

  /**
   * Enable the [query condition cache](/concepts/features/performance/caches/query-condition-cache) for queries that use the `ORDER BY <column> LIMIT n` (TopK) optimization (dynamic filtering or skip-index based). When disabled, such reads neither consult nor populate the cache. Such queries can drop granules during execution depending on the running threshold, so their cache entries are partitioned by the TopK plan parameters and by the set of parts read (for a `File` table, by the set of files read and their versions). This setting has no effect unless `use_query_condition_cache` is also enabled. Possible values: - 0 - Disabled - 1 - Enabled
   * @since 26.9
   */
  use_query_condition_cache_for_top_k?: boolean;

  /**
   * Experimental. Route reads through the new pipeline `ReaderExecutor` instead of the legacy matryoshka of read buffers. Falls back to the legacy path for configurations the executor does not yet support.
   * @since 26.7
   */
  use_reader_executor?: boolean;

  /**
   * Use roaring bitmap for iceberg positional deletes.
   * @since 25.9
   */
  use_roaring_bitmap_iceberg_positional_deletes?: boolean;

  /**
   * Use data skipping indexes during query execution. Possible values: - 0 — Disabled. - 1 — Enabled.
   */
  use_skip_indexes?: boolean;

  /**
   * Evaluate WHERE filters with mixed AND and OR conditions using skip indexes. Example: WHERE A = 5 AND (B = 5 OR C = 5). If disabled, skip indexes are still used to evaluate WHERE conditions but they must only contain AND-ed clauses. Possible values: - 0 — Disabled. - 1 — Enabled.
   * @since 26.1
   */
  use_skip_indexes_for_disjunctions?: boolean;

  /**
   * Enable using data skipping indexes for TopK filtering. When enabled, if a minmax skip index exists on the column in `ORDER BY <column> LIMIT n` query, optimizer will attempt to use the minmax index to skip granules that are not relevant for the final result . This can reduce query latency. Possible values: - 0 — Disabled. - 1 — Enabled.
   * @since 26.1
   */
  use_skip_indexes_for_top_k?: boolean;

  /**
   * Controls whether skipping indexes are used when executing a query with the FINAL modifier. Skip indexes may exclude rows (granules) containing the latest data, which could lead to incorrect results from a query with the `FINAL` modifier. When this setting is enabled, skipping indexes are applied even with the `FINAL` modifier, potentially improving performance. Correct results still depend on setting `use_skip_indexes_if_final_exact_mode`, which is enabled by default and scans the additional parts that overlap the ranges returned by the skip index. The risk of missing recent updates applies only if that setting is disabled. Possible values: - 0 — Disabled. - 1 — Enabled.
   */
  use_skip_indexes_if_final?: boolean;

  /**
   * Controls whether granules returned by a skipping index are expanded in newer parts to return correct results when executing a query with the FINAL modifier. Using skip indexes may exclude rows (granules) containing the latest data which could lead to incorrect results. This setting can ensure that correct results are returned by scanning newer parts that have overlap with the ranges returned by the skip index. This setting should be disabled only if approximate results based on looking up the skip index are okay for an application. Possible values: - 0 — Disabled. - 1 — Enabled.
   * @since 25.6
   */
  use_skip_indexes_if_final_exact_mode?: boolean;

  /**
   * Enable using data skipping indexes during data reading. When enabled, skip indexes are evaluated dynamically at the time each data granule is being read, rather than being analyzed in advance before query execution begins. This can reduce query startup latency. Possible values: - 0 — Disabled. - 1 — Enabled.
   * @since 25.10
   */
  use_skip_indexes_on_data_read?: boolean;

  /**
   * /// preferred over 'allow_statistics_optimize' because of consistency with 'use_primary_key' and 'use_skip_indexes' Allows using statistics to optimize queries
   * @since 26.2
   */
  use_statistics?: boolean;

  /**
   * Use statistics cache in a query to avoid the overhead of loading statistics of every parts
   * @since 25.12
   */
  use_statistics_cache?: boolean;

  /**
   * Answer `min`, `max` and `count` aggregations from per-part column statistics instead of reading data. When enabled, a query of the form `SELECT min(column), max(column), count() FROM table` without `GROUP BY` and filters is answered from column statistics (e.g. MinMax statistics, see the `auto_statistics_types` MergeTree setting) for the data parts that have them materialized, and only the remaining parts are read. Possible values: - 0 — Disabled. - 1 — Enabled.
   * @since 26.10
   */
  use_statistics_for_min_max_aggregation?: boolean;

  /**
   * Use statistics to filter out parts during query execution. When enabled, pruning in SELECT queries will use column statistics (e.g. MinMax statistics) to eliminate parts that cannot contain matching data before reading any data. Possible values: - 0 — Disabled. - 1 — Enabled.
   * @since 26.5
   */
  use_statistics_for_part_pruning?: boolean;

  /**
   * When loading marks for MergeTree parts, compress them into the in-memory representation one block at a time (streaming) instead of materializing the full plain marks array first. This significantly reduces peak memory usage during marks loading for compact parts with many substreams (e.g. tables with JSON columns and write_marks_for_substreams_in_compact_parts enabled).
   * @since 26.8
   */
  use_streaming_marks_compression?: boolean;

  /**
   * When enabled, strictly enforces both minimum and maximum insert block size limits. A block is emitted when: - Min thresholds (AND): Both min_insert_block_size_rows AND min_insert_block_size_bytes are reached. - Max thresholds (OR): Either max_insert_block_size_rows OR max_insert_block_size_bytes is reached. When disabled, a block is emitted when: - Min thresholds (OR): min_insert_block_size_rows OR min_insert_block_size_bytes is reached. **Note**: If max settings are smaller than min settings, the max limits take precedence and blocks will be emitted before min thresholds are reached. **Note**: This setting is automatically disabled for async inserts, because async inserts attach per-entry deduplication tokens that are incompatible with block splitting that is needed for enforcement of strict limits. Disabled by default.
   * @since 26.5
   */
  use_strict_insert_block_limits?: boolean;

  /**
   * Use structure from insertion table instead of schema inference from data. Possible values: 0 - disabled, 1 - enabled, 2 - auto
   */
  use_structure_from_insertion_table_in_table_functions?: bigint;

  /**
   * Whether to cache deserialized text index headers in memory. Using the text index header cache can significantly reduce latency and increase throughput when working with a large number of text index queries.
   * @since 25.12
   */
  use_text_index_header_cache?: boolean;

  /**
   * Enable evaluation of LIKE/ILIKE queries by scanning the inverted text index dictionary. The accelerated patterns are `%value%`, `value%` and `%value`, as well as the `startsWith` and `endsWith` calls that `optimize_rewrite_like_perfect_affix` rewrites into `value%` and `%value`. A `multiSearchAny`, `multiSearchAnyUTF8`, `multiSearchAnyCaseInsensitive` or `multiSearchAnyCaseInsensitiveUTF8` call with one needle is searched as `%value%`.
   * @since 26.5
   */
  use_text_index_like_evaluation_by_dictionary_scan?: boolean;

  /**
   * Whether to cache text index tokens that are absent from a data part. The negative tokens cache uses the text index tokens cache and avoids repeated dictionary lookups for absent tokens.
   * @since 26.9
   */
  use_text_index_negative_tokens_cache?: boolean;

  /**
   * Whether to cache text index pattern dictionary scans that exceed `text_index_like_max_postings_to_read`. The pattern bypass cache uses the text index tokens cache and avoids repeating dictionary scans that previously fell back to evaluating the original predicate.
   * @since 26.11
   */
  use_text_index_pattern_bypass_cache?: boolean;

  /**
   * Whether to cache deserialized text index posting lists in memory. Using the text index postings cache can significantly reduce latency and increase throughput when working with a large number of text index queries.
   * @since 25.12
   */
  use_text_index_postings_cache?: boolean;

  /**
   * Whether to cache deserialized text index token infos in memory. Using the text index tokens cache can significantly reduce latency and increase throughput when working with a large number of text index queries.
   * @since 26.4
   */
  use_text_index_tokens_cache?: boolean;

  /**
   * Enable dynamic filtering optimization when executing a `ORDER BY <column> LIMIT n` query. When enabled, the query executor will try to skip granules and rows that will not be part of the final `top N` rows in the resultset. This optimization is dynamic in nature and latency improvements depends on data distribution and presence of other predicates in the query. Possible values: - 0 — Disabled. - 1 — Enabled.
   * @since 26.1
   */
  use_top_k_dynamic_filtering?: boolean;

  /**
   * Allow `use_top_k_dynamic_filtering` to apply when the sort column has a variable-length data type (e.g. `String`, `Array`, `Map`, `Tuple` containing variable-length elements). For such types, the per-row threshold comparison performed by the dynamic filter can outweigh its savings when the column's lexicographic minimum dominates (e.g. mostly empty strings) and few granules can be skipped. In that case the dynamic filter degrades query latency rather than improving it. When this setting is `0`, dynamic filtering is restricted to columns whose values have a fixed maximum size in memory (numbers, `Date`, `DateTime`, `FixedString`, `Enum`, `Nullable` of such types, `Tuple` of such types). When set to `1`, dynamic filtering applies to variable-length types as well. Possible values: - 0 — Disabled. - 1 — Enabled.
   * @since 26.6
   */
  use_top_k_dynamic_filtering_for_variable_length_types?: boolean;

  /**
   * Whether to use a cache of uncompressed blocks. Accepts 0 or 1. By default, 0 (disabled). Using the uncompressed cache (only for tables in the MergeTree family) can significantly reduce latency and increase throughput when working with a large number of short queries. Enable this setting for users who send frequent short requests. Also pay attention to the [uncompressed_cache_size](/reference/settings/server-settings/settings/uncompressed-cache#uncompressed_cache_size) configuration parameter (only set in the config file) – the size of uncompressed cache blocks. By default, it is 8 GiB. The uncompressed cache is filled in as needed and the least-used data is automatically deleted. For queries that read at least a somewhat large volume of data (one million rows or more), the uncompressed cache is disabled automatically to save space for truly small queries. This means that you can keep the 'use_uncompressed_cache' setting always set to 1.
   */
  use_uncompressed_cache?: boolean;

  /**
   * Allows to use `Variant` type as a result type for [if](/reference/functions/regular-functions/conditional-functions#if)/[multiIf](/reference/functions/regular-functions/conditional-functions#multiIf)/[array](/reference/functions/regular-functions/array-functions)/[map](/reference/functions/regular-functions/tuple-map-functions) functions when there is no common type for argument types. Example: ```sql SET use_variant_as_common_type = 1; SELECT toTypeName(if(number % 2, number, range(number))) as variant_type FROM numbers(1); SELECT if(number % 2, number, range(number)) as variant FROM numbers(5); ``` ```text ┌─variant_type───────────────────┐ │ Variant(Array(UInt64), UInt64) │ └────────────────────────────────┘ ┌─variant───┐ │ [] │ │ 1 │ │ [0,1] │ │ 3 │ │ [0,1,2,3] │ └───────────┘ ``` ```sql SET use_variant_as_common_type = 1; SELECT toTypeName(multiIf((number % 4) = 0, 42, (number % 4) = 1, [1, 2, 3], (number % 4) = 2, 'Hello, World!', NULL)) AS variant_type FROM numbers(1); SELECT multiIf((number % 4) = 0, 42, (number % 4) = 1, [1, 2, 3], (number % 4) = 2, 'Hello, World!', NULL) AS variant FROM numbers(4); ``` ```text ─variant_type─────────────────────────┐ │ Variant(Array(UInt8), String, UInt8) │ └──────────────────────────────────────┘ ┌─variant───────┐ │ 42 │ │ [1,2,3] │ │ Hello, World! │ │ ᴺᵁᴸᴸ │ └───────────────┘ ``` ```sql SET use_variant_as_common_type = 1; SELECT toTypeName(array(range(number), number, 'str_' || toString(number))) as array_of_variants_type from numbers(1); SELECT array(range(number), number, 'str_' || toString(number)) as array_of_variants FROM numbers(3); ``` ```text ┌─array_of_variants_type────────────────────────┐ │ Array(Variant(Array(UInt64), String, UInt64)) │ └───────────────────────────────────────────────┘ ┌─array_of_variants─┐ │ [[],0,'str_0'] │ │ [[0],1,'str_1'] │ │ [[0,1],2,'str_2'] │ └───────────────────┘ ``` ```sql SET use_variant_as_common_type = 1; SELECT toTypeName(map('a', range(number), 'b', number, 'c', 'str_' || toString(number))) as map_of_variants_type from numbers(1); SELECT map('a', range(number), 'b', number, 'c', 'str_' || toString(number)) as map_of_variants FROM numbers(3); ``` ```text ┌─map_of_variants_type────────────────────────────────┐ │ Map(String, Variant(Array(UInt64), String, UInt64)) │ └─────────────────────────────────────────────────────┘ ┌─map_of_variants───────────────┐ │ {'a':[],'b':0,'c':'str_0'} │ │ {'a':[0],'b':1,'c':'str_1'} │ │ {'a':[0,1],'b':2,'c':'str_2'} │ └───────────────────────────────┘ ```
   */
  use_variant_as_common_type?: boolean;

  /**
   * Enables or disables default implementation for Variant type in comparison functions.
   * @since 26.2
   */
  use_variant_default_implementation_for_comparisons?: boolean;

  /**
   * Columns preceding WITH FILL columns in ORDER BY clause form sorting prefix. Rows with different values in sorting prefix are filled independently
   */
  use_with_fill_by_sorting_prefix?: boolean;

  /**
   * If enabled, validate enum literals in operators like `IN`, `NOT IN`, `==`, `!=` against the enum type and throw an exception if the literal is not a valid enum value.
   * @since 25.2
   */
  validate_enum_literals_in_operators?: boolean;

  /**
   * Controls whether the grouping keys that `GROUP BY ALL` expands the `SELECT` expressions into are checked against [allow_suspicious_types_in_group_by](#allow_suspicious_types_in_group_by). Disable it to restore the behavior of versions before 26.7, which accepted a [Variant](/reference/data-types/variant) or [Dynamic](/reference/data-types/dynamic) key written as `GROUP BY ALL`, for example a grouping key that is an untyped JSON subpath. Takes effect only when the analyzer is enabled (`enable_analyzer = 1`, the default); with the old analyzer such a key was rejected before 26.7 as well, so there is nothing to restore there. An explicit `GROUP BY` is unaffected and keeps rejecting such a key either way, so this is narrower than setting `allow_suspicious_types_in_group_by`, which also permits them in an explicit `GROUP BY`. Possible values: - 0 - The key types `GROUP BY ALL` expands into are not validated. - 1 - They are validated, as an explicit `GROUP BY` validates its own keys.
   * @since 26.10
   */
  validate_group_by_all_key_types?: boolean;

  /**
   * Enables or disables throwing an exception in the [pointInPolygon](/reference/functions/regular-functions/geo/coordinates#pointinpolygon) function, if the polygon is self-intersecting or self-tangent. Possible values: - 0 — Throwing an exception is disabled. `pointInPolygon` accepts invalid polygons and returns possibly incorrect results for them. - 1 — Throwing an exception is enabled.
   */
  validate_polygons?: boolean;

  /**
   * When applying a function to a [Variant](/reference/data-types/variant) column using the default implementation, controls what happens for rows whose actual type is incompatible with the function: - `true` (default) — throw an exception. - `false` — return `NULL` for those rows instead.
   * @since 26.5
   */
  variant_throw_on_type_mismatch?: boolean;

  /**
   * If a vector search query has a WHERE clause, this setting determines if it is evaluated first (pre-filtering) OR if the vector similarity index is checked first (post-filtering). Possible values: - 'auto' - Postfiltering (the exact semantics may change in future). - 'postfilter' - Use vector similarity index to identify the nearest neighbours, then apply other filters - 'prefilter' - Evaluate other filters first, then perform brute-force search to identify neighbours.
   * @since 25.6
   */
  vector_search_filter_strategy?: "auto" | "prefilter" | "postfilter";

  /**
   * Multiply the number of fetched nearest neighbors from the vector similarity index by this number. Only applied for post-filtering with other predicates or if setting 'vector_search_with_rescoring = 1'. Valid range: [1.0, 1000.0]. Values outside this range are rejected.
   * @since 25.9
   */
  vector_search_index_fetch_multiplier?: number;

  /**
   * Enables a two-stage approximate vector search without index (brute force scan) over a `Quantized`-compressed column. When enabled, `ORDER BY L2Distance|cosineDistance(vec, reference) LIMIT k` against a column encoded with a `Quantized(...)` codec will 1. scan and filter the quantized vectors (this step produces `k * vector_search_index_fetch_multiplier` results), and 2. rescore the found vectors against original, full-precision vectors.
   * @since 26.8
   */
  vector_search_use_quantized_codes?: boolean;

  /**
   * If ClickHouse performs rescoring for queries that use the vector similarity index. Without rescoring, the vector similarity index returns the rows containing the best matches directly. With rescoring, the vector similarity index fetches candidate rows and ClickHouse computes the exact distance for these rows from the original full-precision vectors in the regular SQL pipeline. When possible, ClickHouse filters the scan to candidate rows before the final distance computation. Increase `vector_search_index_fetch_multiplier` if more candidate rows are needed for better recall, especially with additional filters or quantized vector indexes. Note: A query run without rescoring and with parallel replicas enabled may fall back to rescoring.
   * @since 25.9
   */
  vector_search_with_rescoring?: boolean;

  /**
   * Wait for committed changes to become actually visible in the latest snapshot
   */
  wait_changes_become_visible_after_commit_mode?: "async" | "wait" | "wait_unknown";

  /**
   * If true wait for processing of asynchronous insertion.
   */
  wait_for_async_insert?: boolean;

  /**
   * Timeout for waiting for processing asynchronous insertion.
   */
  wait_for_async_insert_timeout?: number;

  /**
   * Controls whether each sink commits its just-written part before its own dependent materialized view cascade runs, so a cascade that reads back from the source via `JOIN` observes the part written by that sink. The guarantee is per sink instance — parts written by other sink threads of the same `INSERT` may not yet be visible. The setting does not provide cross-thread commit ordering. Has no effect on inserts into tables with no dependent materialized views.
   * @since 26.7
   */
  wait_for_part_commit_in_dependent_materialized_views?: boolean;

  /**
   * Fraction of a WebAssembly UDF instance's linear memory that one call's serialized input may occupy. Must be at least 0 and at most 1; the default leaves the other half to the guest for its own working set beside the input buffer. The margin below 1 is what makes the batching safe: the guest's own data, stack and allocator share that memory and are invisible to the host. A ratio close to 1 leaves nothing for them, so a call sized against it can still fail inside the guest's allocator. Read only for `ABI BUFFERED_V1`, and it sizes the calls only while `webassembly_udf_max_input_block_size` is 0 - a non-zero block size caps the rows per call instead. A batch is never taken below a single row, so a row whose own serialized size is past the budget is passed on its own, and one too large for the module's linear memory fails inside the guest's allocator. Set to 0 to leave the input unsplit: the whole pipeline block is passed in one call.
   * @since 26.10
   */
  webassembly_udf_input_split_memory_ratio?: number;

  /**
   * Fuel limit per WebAssembly UDF instance execution. Each WebAssembly instruction consumes some amount of fuel. The value is scaled by 1024 before being passed to the runtime, so `webassembly_udf_max_fuel = 1` corresponds to approximately 1024 fuel units. Set to 0 for no finite limit. Applies only to functions whose per-function setting `webassembly_udf_enable_fuel` is true, which is the default.
   * @since 26.4
   */
  webassembly_udf_max_fuel?: bigint;

  /**
   * Maximum number of rows passed to a WebAssembly UDF in a single call. A non-zero value caps the rows per call and applies to every ABI. Set to 0 to size the calls by their serialized input instead. That applies to `ABI BUFFERED_V1` alone, the only ABI that serializes a whole input block into guest memory: its blocks are split so that a call's input stays within `webassembly_udf_input_split_memory_ratio` of the module's linear memory. `ROW_DIRECT` passes its arguments as WebAssembly values and `ASSEMBLYSCRIPT` builds one object per row, so neither has a serialized input to size a call by, and 0 leaves their pipeline block whole.
   * @since 26.4
   */
  webassembly_udf_max_input_block_size?: bigint;

  /**
   * Maximum number of WebAssembly UDF instances that can run in parallel per function.
   * @since 26.4
   */
  webassembly_udf_max_instances?: bigint;

  /**
   * Memory limit in bytes per WebAssembly UDF instance.
   * @since 26.4
   */
  webassembly_udf_max_memory?: bigint;

  /**
   * Base scheduling weight of the query within its workload, used by the `fair` workload scheduler (see the `scheduler` workload setting). Queries with a higher weight receive a proportionally larger share of a time-shared resource (CPU, IO) when they compete inside the same workload. Ignored by the default `fifo` scheduler. A non-positive value (`<= 0`) is meaningless for the fair share and is treated as the default `1.0`.
   * @since 26.11
   */
  weight?: number;

  /**
   * For the `fair` workload scheduler: once the query has been running (wall-clock) for this many seconds, its weight is lowered by `weight_lowering_factor`. `0` (or any negative value) disables the age threshold.
   * @since 26.11
   */
  weight_lowering_age_seconds?: number;

  /**
   * For the `fair` workload scheduler: once the query has attained this many CPU-seconds, its weight is lowered by `weight_lowering_factor`. Applies to CPU resources. `0` (or any negative value) disables the CPU threshold. Attained CPU is the granted scheduler service, charged when a request is granted rather than as CPU is spent, so it leads actual consumption by at most one quantum (`cpu_slot_quantum_ns`) per active slot. This is only meaningful with CPU slot preemption (`cpu_slot_preemption = 1`, the default); without preemption CPU slots carry a fixed per-slot cost rather than real CPU time, so this threshold — like the other `fair` CPU settings — no longer reflects actual CPU consumption.
   * @since 26.11
   */
  weight_lowering_cpu_seconds?: number;

  /**
   * For the `fair` workload scheduler: once the query crosses any of the `weight_lowering_*` thresholds below, its effective weight is multiplied by this factor once (values in (0, 1) lower the weight, biasing scheduling toward shorter/newer queries). The thresholds do not combine — the first one to trip applies the full lowering. `1.0` disables lowering. The value is clamped to the range `[0, 1]`, so the factor can only ever lower a query's weight, never raise it.
   * @since 26.11
   */
  weight_lowering_factor?: number;

  /**
   * For the `fair` workload scheduler: once the query has attained this many bytes of IO, its weight is lowered by `weight_lowering_factor`. Applies to IO resources. `0` (or any negative value) disables the IO threshold.
   * @since 26.11
   */
  weight_lowering_io_bytes?: number;

  /**
   * Name of workload to be used to access resources
   */
  workload?: string;

  /**
   * The maximum time a query waits to be admitted by workload scheduling before it fails without starting. It bounds the combined wait for a query slot (from a `CREATE RESOURCE ... (QUERY)` resource, limited by the workload's `max_concurrent_queries`) and for a memory reservation (from a `CREATE RESOURCE ... (MEMORY RESERVATION)` resource together with the `reserve_memory` setting). Both are acquired before the query starts running, so this is the only way to bound that pre-execution wait: `max_execution_time` does not apply yet because the query has not started. When the timeout expires the query fails with one of two distinct errors, depending on which resource it was waiting for: `QUERY_SLOT_ACQUISITION_TIMEOUT` for a query slot, or `MEMORY_RESERVATION_ACQUISITION_TIMEOUT` for a memory reservation. Possible values: - Positive integer — timeout in milliseconds. - 0 — Infinite timeout: the query waits indefinitely for admission (default). It can still be rejected immediately when the workload's `max_waiting_queries` limit is reached.
   * @since 26.10
   */
  workload_admission_timeout_ms?: number;

  /**
   * Scheduling priority of the query within its workload, used by the `priority` workload scheduler (see the `scheduler` workload setting). Lower value = higher priority; the default `0` is the neutral baseline, a negative value raises the query above the default and a positive value lowers it. Queries of equal priority are served first-come-first-served. Ignored by the other schedulers.
   * @since 26.11
   */
  workload_priority?: bigint;

  /**
   * Write full paths (including s3://) into iceberg metadata files.
   * @since 25.9
   */
  write_full_path_in_iceberg_metadata?: boolean;

  /**
   * Only has an effect in ClickHouse Cloud. The maximum size of the buffer which is written to distributed cache servers, per write buffer. It is independent of the buffer which is written to the object storage: that one keeps growing towards the upload part size. If 0, `DBMS_DEFAULT_BUFFER_SIZE` (1 MiB) is used. The buffer starts at `adaptive_write_buffer_initial_size` and grows up to this size only as the stream is written, so that a part does not allocate it for every stream it writes.
   * @since 25.8
   */
  write_through_distributed_cache_buffer_size?: bigint;

  /**
   * Allows you to select the max window log of ZSTD (it will not be used for MergeTree family)
   */
  zstd_window_log_max?: bigint;

  /** Index signature for unknown/custom settings */
  [key: string]: unknown;
}
