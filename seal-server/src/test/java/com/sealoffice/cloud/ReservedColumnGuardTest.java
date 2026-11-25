package com.sealoffice.cloud;

import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.config.BeanDefinition;
import org.springframework.context.annotation.ClassPathScanningCandidateComponentProvider;
import org.springframework.core.type.filter.RegexPatternTypeFilter;

import java.lang.reflect.Field;
import java.lang.reflect.Modifier;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Pattern;

import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 全实体保留字守卫（2.8.0 预览修复 5.1）：凡实体字段对应的列名是 MySQL 8 保留字，
 * 映射列名必须带反引号，避免 MyBatis-Plus 生成的 SQL 再次出现 blob 那样的语法错误。
 */
class ReservedColumnGuardTest {

    /** MySQL 8.0 保留字中可能被用作列名的部分（完整列表见官方文档 Keywords and Reserved Words） */
    private static final Set<String> RESERVED = Set.of(
            "add", "all", "alter", "and", "as", "asc", "before", "between", "blob", "both", "by", "call", "case",
            "change", "char", "check", "column", "condition", "constraint", "create", "cross", "cube", "current_date",
            "current_time", "cursor", "database", "default", "delete", "desc", "describe", "distinct", "div", "double",
            "drop", "each", "else", "empty", "exists", "explain", "false", "fetch", "float", "for", "force", "from",
            "function", "grant", "group", "groups", "having", "if", "ignore", "in", "index", "inner", "insert", "int",
            "interval", "into", "is", "join", "key", "keys", "kill", "lag", "lead", "leading", "left", "like", "limit",
            "lines", "load", "lock", "long", "match", "mod", "natural", "not", "null", "of", "on", "option", "or",
            "order", "out", "outer", "over", "partition", "primary", "range", "rank", "read", "real", "references",
            "release", "rename", "repeat", "replace", "require", "return", "revoke", "right", "row", "rows", "schema",
            "select", "set", "show", "signal", "sql", "system", "table", "then", "to", "trigger", "true", "union",
            "unique", "update", "usage", "use", "using", "values", "when", "where", "while", "window", "with", "write");

    private static String column(Field field) {
        TableId id = field.getAnnotation(TableId.class);
        if (id != null && !id.value().isEmpty()) {
            return id.value();
        }
        TableField annotation = field.getAnnotation(TableField.class);
        if (annotation != null && !annotation.value().isEmpty()) {
            return annotation.value();
        }
        return field.getName().replaceAll("([A-Z])", "_$1").toLowerCase(Locale.ROOT);
    }

    @Test
    void 实体中保留字列名全部带反引号() throws Exception {
        ClassPathScanningCandidateComponentProvider scanner = new ClassPathScanningCandidateComponentProvider(false);
        scanner.addIncludeFilter(new RegexPatternTypeFilter(Pattern.compile(".*Entity")));
        List<String> problems = new ArrayList<>();
        int entities = 0;
        for (BeanDefinition definition : scanner.findCandidateComponents("com.sealoffice.cloud")) {
            Class<?> type = Class.forName(definition.getBeanClassName());
            entities++;
            for (Field field : type.getDeclaredFields()) {
                if (Modifier.isStatic(field.getModifiers())) {
                    continue;
                }
                TableField annotation = field.getAnnotation(TableField.class);
                if (annotation != null && !annotation.exist()) {
                    continue;
                }
                String column = column(field);
                String bare = column.replace("`", "");
                if (RESERVED.contains(bare) && !column.startsWith("`")) {
                    problems.add(type.getSimpleName() + "." + field.getName() + " -> " + column);
                }
            }
        }
        assertTrue(entities >= 20, "应扫描到全部实体，实际 " + entities);
        assertTrue(problems.isEmpty(), "以下列名是 MySQL 保留字但未加反引号：" + problems);
    }
}
