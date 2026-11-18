<?php

namespace app\common\config;

/**
 * 简单配置仓库。
 *
 * 合并默认配置文件和 runtime 配置文件，当前用于早期框架骨架阶段替代完整 ThinkPHP 配置服务。
 * runtime 文件只保存后台改过的值(overrides),默认值始终以 config/*.php 为准,
 * 这样升级代码后新的默认值(如依赖包检测类名、配置 schema)能直接生效。
 * Author: qiufeng
 */
final class ConfigRepository
{
    /** 由代码定义、不允许被 runtime 覆盖的键(旧版本曾把它们整份写进 runtime 文件) */
    private const CODE_DEFINED_KEYS = ['integration.packages', 'integration.schema'];

    private array $items = [];

    private array $defaults = [];

    /** 后台改过、需要写回 runtime 文件的值 */
    private array $overrides = [];

    public function __construct(
        private readonly array $defaultConfigFiles,
        private readonly string $runtimeConfigFile
    ) {
        $this->loadDefaults();
        $this->loadRuntime();
    }

    public function get(string $key, mixed $default = null): mixed
    {
        $segments = explode('.', $key);
        $value = $this->items;

        foreach ($segments as $segment) {
            if (!is_array($value) || !array_key_exists($segment, $value)) {
                return $default;
            }

            $value = $value[$segment];
        }

        return $value;
    }

    public function set(string $key, mixed $value): void
    {
        self::assign($this->items, $key, $value);
        self::assign($this->overrides, $key, $value);
    }

    public function save(): void
    {
        $directory = dirname($this->runtimeConfigFile);

        if (!is_dir($directory)) {
            mkdir($directory, 0775, true);
        }

        file_put_contents(
            $this->runtimeConfigFile,
            json_encode(
                self::diff($this->overrides, $this->defaults) ?: new \stdClass(),
                JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES
            )
        );
    }

    public function all(): array
    {
        return $this->items;
    }

    private function loadDefaults(): void
    {
        foreach ($this->defaultConfigFiles as $file) {
            if (!is_file($file)) {
                continue;
            }

            $config = require $file;
            if (is_array($config)) {
                $this->defaults = array_replace_recursive($this->defaults, $config);
            }
        }

        $this->items = $this->defaults;
    }

    private function loadRuntime(): void
    {
        if (!is_file($this->runtimeConfigFile)) {
            return;
        }

        $decoded = json_decode((string) file_get_contents($this->runtimeConfigFile), true);
        if (!is_array($decoded)) {
            return;
        }

        foreach (self::CODE_DEFINED_KEYS as $key) {
            self::forget($decoded, $key);
        }

        // 只保留和默认值不同的部分,兼容旧版本整份写入的 runtime 文件
        $this->overrides = self::diff($decoded, $this->defaults);
        $this->items = array_replace_recursive($this->items, $this->overrides);
    }

    /** 按点号路径写值 */
    private static function assign(array &$target, string $key, mixed $value): void
    {
        $cursor = &$target;
        foreach (explode('.', $key) as $segment) {
            if (!isset($cursor[$segment]) || !is_array($cursor[$segment])) {
                $cursor[$segment] = [];
            }
            $cursor = &$cursor[$segment];
        }
        $cursor = $value;
    }

    /** 按点号路径删除 */
    private static function forget(array &$target, string $key): void
    {
        $segments = explode('.', $key);
        $last = array_pop($segments);
        $cursor = &$target;
        foreach ($segments as $segment) {
            if (!isset($cursor[$segment]) || !is_array($cursor[$segment])) {
                return;
            }
            $cursor = &$cursor[$segment];
        }
        unset($cursor[$last]);
    }

    /**
     * 返回 $values 中与 $defaults 不同的部分。
     * 关联数组逐键比较;列表(如 IP 规则)整体比较,不做逐项合并。
     */
    private static function diff(array $values, array $defaults): array
    {
        $result = [];
        foreach ($values as $key => $value) {
            if (!array_key_exists($key, $defaults)) {
                $result[$key] = $value;
                continue;
            }

            $default = $defaults[$key];
            if (is_array($value) && is_array($default) && !array_is_list($value) && !array_is_list($default)) {
                $nested = self::diff($value, $default);
                if ($nested !== []) {
                    $result[$key] = $nested;
                }
            } elseif ($value !== $default) {
                $result[$key] = $value;
            }
        }

        return $result;
    }
}
